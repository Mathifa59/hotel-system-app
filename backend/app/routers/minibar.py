import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user, require_role
from app.models.charge import Charge
from app.models.enums import ChargeStatus, ChargeType, UserRole
from app.models.minibar import MinibarConsumption, MinibarProduct, RoomMinibarStock
from app.models.room import Room
from app.models.user import User
from app.schemas.minibar import (
    ConsumptionCreate,
    ConsumptionRegisterOut,
    MinibarProductCreate,
    MinibarProductOut,
    StockOut,
    StockSetRequest,
)
from app.services.activity_log import log_activity
from app.services.events import publish_event
from app.services.notifications import create_notification

router = APIRouter(prefix="/minibar", tags=["minibar"])


@router.get("/products", response_model=list[MinibarProductOut])
def list_products(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(MinibarProduct).order_by(MinibarProduct.name).all()


@router.post("/products", response_model=MinibarProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    data: MinibarProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.cleaning, UserRole.reception)),
):
    product = MinibarProduct(**data.model_dump())
    db.add(product)
    db.flush()
    log_activity(
        db,
        user_id=current_user.id,
        action="minibar_product.created",
        entity="minibar_products",
        entity_id=product.id,
        meta={"name": product.name},
    )
    db.commit()
    db.refresh(product)
    return product


@router.get("/stock", response_model=list[StockOut])
def get_stock(
    room_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(RoomMinibarStock).filter(RoomMinibarStock.room_id == room_id).all()


@router.put("/stock", response_model=StockOut)
def set_stock(
    data: StockSetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.cleaning, UserRole.reception)),
):
    """Setea/reabastece el stock de un producto en un cuarto (upsert)."""
    room = db.get(Room, data.room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")
    product = db.get(MinibarProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    stock = (
        db.query(RoomMinibarStock)
        .filter(RoomMinibarStock.room_id == data.room_id, RoomMinibarStock.product_id == data.product_id)
        .first()
    )
    if stock is None:
        stock = RoomMinibarStock(
            room_id=data.room_id,
            product_id=data.product_id,
            quantity=data.quantity,
            initial_quantity=data.quantity,
        )
        db.add(stock)
    else:
        stock.quantity = data.quantity
        stock.initial_quantity = data.quantity

    log_activity(
        db,
        user_id=current_user.id,
        action="minibar_stock.updated",
        entity="rooms",
        entity_id=room.id,
        meta={"product": product.name, "quantity": data.quantity},
    )
    db.commit()
    db.refresh(stock)
    return stock


@router.post("/consumptions", response_model=ConsumptionRegisterOut, status_code=status.HTTP_201_CREATED)
def register_consumption(
    data: ConsumptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.cleaning, UserRole.admin)),
):
    room = db.get(Room, data.room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")
    if not room.has_minibar:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este cuarto no tiene frigobar")
    if not data.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debe incluir al menos un ítem")

    stocks_by_product = {}
    for item in data.items:
        product = db.get(MinibarProduct, item.product_id)
        if product is None or not product.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Producto {item.product_id} no existe")

        stock = (
            db.query(RoomMinibarStock)
            .filter(RoomMinibarStock.room_id == data.room_id, RoomMinibarStock.product_id == item.product_id)
            .first()
        )
        if stock is None or stock.quantity < item.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stock insuficiente de {product.name} en el cuarto {room.number}",
            )
        stocks_by_product[item.product_id] = (product, stock)

    consumptions = []
    total_pen = 0
    total_usd = 0
    for item in data.items:
        product, stock = stocks_by_product[item.product_id]
        line_total_pen = product.price_pen * item.quantity
        line_total_usd = product.price_usd * item.quantity

        consumption = MinibarConsumption(
            room_id=data.room_id,
            reservation_id=data.reservation_id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price_pen=product.price_pen,
            unit_price_usd=product.price_usd,
            total_pen=line_total_pen,
            total_usd=line_total_usd,
            registered_by=current_user.id,
        )
        db.add(consumption)
        consumptions.append(consumption)

        stock.quantity -= item.quantity
        total_pen += line_total_pen
        total_usd += line_total_usd

    detail = ", ".join(f"{item.quantity}x {stocks_by_product[item.product_id][0].name}" for item in data.items)
    charge = Charge(
        reservation_id=data.reservation_id,
        type=ChargeType.minibar,
        description=f"Frigobar cuarto {room.number} — {detail}",
        amount_pen=total_pen,
        amount_usd=total_usd,
        status=ChargeStatus.pending,
        created_by=current_user.id,
    )
    db.add(charge)
    db.flush()

    log_activity(
        db,
        user_id=current_user.id,
        action="minibar.registered",
        entity="rooms",
        entity_id=room.id,
        meta={
            "items": [{"product_id": str(i.product_id), "quantity": i.quantity} for i in data.items],
            "total_pen": str(total_pen),
            "total_usd": str(total_usd),
        },
    )
    create_notification(
        db,
        audience="admin",
        event="minibar_consumption_registered",
        message=f"Consumo de frigobar registrado — cuarto {room.number} (S/ {total_pen})",
        meta={"room": room.number, "charge_id": str(charge.id), "total_pen": str(total_pen), "total_usd": str(total_usd)},
    )
    db.commit()
    for c in consumptions:
        db.refresh(c)
    db.refresh(charge)

    publish_event(
        "minibar_consumption_registered",
        audiences=["admin"],
        payload={
            "room": room.number,
            "charge_id": str(charge.id),
            "total_pen": str(charge.amount_pen),
            "total_usd": str(charge.amount_usd),
        },
    )

    return ConsumptionRegisterOut(
        consumptions=consumptions,
        charge_id=charge.id,
        charge_total_pen=charge.amount_pen,
        charge_total_usd=charge.amount_usd,
    )
