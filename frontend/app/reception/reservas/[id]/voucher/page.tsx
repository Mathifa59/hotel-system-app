"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import type { Voucher } from "@/lib/types";
import { paymentMethodLabel, paymentMethodLabelEn, roomTypeLabel, roomTypeLabelEn } from "@/lib/labels";

// Datos fijos del hotel para el encabezado del voucher — no hay otro lugar
// en el sistema que los necesite, así que van acá y no en una tabla.
const HOTEL = {
  name: "Apu Garden Lodge",
  ruc: "20601370663",
  address: "Cidruchayoc, lote 178, sector Yanaconas, Urubamba, Cusco, Perú",
  phone: "+51 937 454 282",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

// PEN es la moneda del hotel — se muestra siempre; USD solo si es distinto
// de cero, para no repetir "$ 0.00" en cada línea cuando no aplica.
function money(pen: string, usd: string): string {
  const usdNum = Number(usd);
  return `S/ ${Number(pen).toFixed(2)}` + (usdNum ? ` ($ ${usdNum.toFixed(2)})` : "");
}

export default function VoucherPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    api
      .get<Voucher>(`/reservations/${id}/voucher`, token)
      .then(setVoucher)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el voucher."));
  }, [token, id]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink px-6 text-center">
        <p className="text-sm text-parchment">{error}</p>
        <Link href="/reception/reservas" className="text-sm text-brass hover:underline">
          ← Volver a reservas
        </Link>
      </div>
    );
  }

  if (!voucher) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <p className="text-sm text-parchment-dim">Cargando voucher…</p>
      </div>
    );
  }

  const hasDeposit = voucher.deposit_amount_pen !== null;

  return (
    <div className="min-h-screen bg-ink px-4 py-8 print:bg-white print:p-0">
      {/* Se oculta al imprimir — el papel no necesita el botón que lo generó */}
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 print:hidden">
        <Link href="/reception/reservas" className="text-sm text-parchment-dim transition hover:text-brass">
          ← Volver
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-onbrass transition active:scale-[0.98] hover:bg-brass-bright"
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      {/* Fondo blanco fijo, sin importar el tema de la app — así se ve igual
          en pantalla y en el papel impreso, como cualquier documento. */}
      <div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-white p-8 text-gray-900 shadow-2xl print:mt-0 print:rounded-none print:p-6 print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-5">
          <div className="flex items-center gap-3">
            {/* Siempre la versión a color del logo — la de trazo blanco solo
                se lee sobre fondo oscuro, y este fondo es blanco a propósito. */}
            <Image src="/logo.png" alt="" width={178} height={103} className="h-10 w-auto" />
            <div>
              <p className="text-lg font-bold leading-tight">{HOTEL.name}</p>
              <p className="text-xs text-gray-500">{HOTEL.address}</p>
              <p className="text-xs text-gray-500">
                {HOTEL.phone} · RUC {HOTEL.ruc}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold">{voucher.voucher_number}</p>
            <p className="text-[11px] text-gray-500">Emitido / Issued</p>
            <p className="text-xs text-gray-600">{fmtDateTime(voucher.issued_at)}</p>
          </div>
        </div>

        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Este documento es una <strong>constancia de reserva</strong>, no un comprobante de pago.
          <br />
          This document is a <strong>booking confirmation</strong>, not a payment receipt.
        </p>

        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Huésped / Guest</p>
          <p className="text-base font-semibold">{voucher.guest_name}</p>
          {voucher.guest_id_document && <p className="text-sm text-gray-500">Doc. {voucher.guest_id_document}</p>}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-gray-200 p-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Cuarto / Room</p>
            <p className="text-sm font-medium">
              {voucher.room_number ? `N.° ${voucher.room_number}` : "Por asignar / TBD"}
            </p>
            <p className="text-xs text-gray-500">{roomTypeLabel[voucher.room_type]}</p>
            <p className="text-[11px] text-gray-400">{roomTypeLabelEn[voucher.room_type]}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Llegada / Arrival</p>
            <p className="text-sm font-medium">{fmtDate(voucher.check_in)}</p>
            <p className="text-[11px] text-gray-400">Check-in a partir de / from 11:00 am</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Salida / Departure</p>
            <p className="text-sm font-medium">{fmtDate(voucher.check_out)}</p>
            <p className="text-[11px] text-gray-400">
              Check-out hasta / by 10:00 am — coordinar si necesitas más tiempo
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Huéspedes / Guests</p>
            <p className="text-sm font-medium">{voucher.guests}</p>
            <p className="text-[11px] text-gray-400">
              {voucher.nights} noche(s) / night(s)
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Tarifa por noche / Rate per night</span>
            <span>{money(voucher.price_per_night_pen, voucher.price_per_night_usd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal ({voucher.nights} noche(s) / night(s))</span>
            <span className="font-medium">{money(voucher.subtotal_pen, voucher.subtotal_usd)}</span>
          </div>
          {hasDeposit && (
            <div className="flex justify-between text-emerald-700">
              <span>
                Adelanto pagado / Deposit paid
                {voucher.deposit_method &&
                  ` (${paymentMethodLabel[voucher.deposit_method]} / ${paymentMethodLabelEn[voucher.deposit_method]})`}
              </span>
              <span className="font-medium">
                − {money(voucher.deposit_amount_pen!, voucher.deposit_amount_usd ?? "0")}
              </span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-base font-bold">
            <span>Saldo pendiente al llegar / Balance due on arrival</span>
            <span>{money(voucher.balance_due_pen, voucher.balance_due_usd)}</span>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-4 text-[11px] leading-relaxed text-gray-500">
          <p>Cancelación gratuita hasta 24 horas antes del check-in.</p>
          <p>Free cancellation up to 24 hours before check-in.</p>
        </div>
      </div>
    </div>
  );
}
