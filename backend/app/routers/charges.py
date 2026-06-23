import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import require_role
from app.models.charge import Charge
from app.models.enums import ChargeStatus, UserRole
from app.models.user import User
from app.schemas.charge import ChargeCreate, ChargeOut
from app.services.activity_log import log_activity
from app.services.events import publish_event
from app.services.notifications import create_notification

router = APIRouter(prefix="/charges", tags=["charges"])


@router.get("", response_model=list[ChargeOut])
def list_charges(
    reservation_id: uuid.UUID | None = Query(default=None),
    status_filter: ChargeStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    query = db.query(Charge)
    if reservation_id is not None:
        query = query.filter(Charge.reservation_id == reservation_id)
    if status_filter is not None:
        query = query.filter(Charge.status == status_filter)
    return query.order_by(Charge.created_at.desc()).all()


@router.post("", response_model=ChargeOut, status_code=status.HTTP_201_CREATED)
def create_charge(
    data: ChargeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    charge = Charge(**data.model_dump(), status=ChargeStatus.pending, created_by=current_user.id)
    db.add(charge)
    db.flush()
    log_activity(
        db,
        user_id=current_user.id,
        action="charge.created",
        entity="charges",
        entity_id=charge.id,
        meta={"type": data.type.value, "amount": str(data.amount)},
    )
    create_notification(
        db,
        audience="admin",
        event="charge_created",
        message=f"Nuevo cargo: {data.description} (${data.amount})",
        meta={"charge_id": str(charge.id), "type": data.type.value, "amount": str(data.amount)},
    )
    db.commit()
    db.refresh(charge)

    publish_event(
        "charge_created",
        audiences=["admin"],
        payload={"charge_id": str(charge.id), "type": charge.type.value, "amount": str(charge.amount)},
    )
    return charge


@router.patch("/{charge_id}/approve", response_model=ChargeOut)
def approve_charge(
    charge_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    charge = db.get(Charge, charge_id)
    if charge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo no encontrado")
    if charge.status != ChargeStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El cargo no está pendiente")

    charge.status = ChargeStatus.approved
    log_activity(db, user_id=current_user.id, action="charge.approved", entity="charges", entity_id=charge.id)
    create_notification(
        db,
        audience="reception",
        event="charge_approved",
        message=f"Cargo aprobado: {charge.description} (${charge.amount})",
        meta={"charge_id": str(charge.id), "amount": str(charge.amount)},
    )
    db.commit()
    db.refresh(charge)

    publish_event(
        "charge_approved",
        audiences=["reception"],
        payload={"charge_id": str(charge.id), "amount": str(charge.amount)},
    )
    return charge


@router.patch("/{charge_id}/bill", response_model=ChargeOut)
def bill_charge(
    charge_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.reception, UserRole.admin)),
):
    charge = db.get(Charge, charge_id)
    if charge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cargo no encontrado")
    if charge.status != ChargeStatus.approved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El cargo no está aprobado")

    charge.status = ChargeStatus.billed
    log_activity(db, user_id=current_user.id, action="charge.billed", entity="charges", entity_id=charge.id)
    db.commit()
    db.refresh(charge)
    return charge
