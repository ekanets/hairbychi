import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import { ApiRequestError } from "../../api/client";
import { adminBatchBookings, adminResolveCancel, adminResolveReschedule } from "../../api/endpoints";
import type { AdminBookingListItem, BookingStatus } from "../../api/types";
import { errorMessage } from "../../lib/errors";
import { cn } from "../../lib/format";
import { fetchAllPages } from "../../lib/pagination";
import { DISPLAY_TIMEZONE, formatDateTime, formatTime, reginaDateTimeToUtc } from "../../lib/timezone";
import { Button } from "../../ui/Button";
import { Panel, StudioTitle, inputCls } from "./StudioLayout";

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "payment_failed", label: "Payment failed" },
  { value: "cancelled_by_client", label: "Cancelled by client" },
  { value: "cancelled_by_stylist", label: "Cancelled by you" },
  { value: "expired", label: "Expired" },
  { value: "completed", label: "Completed" },
  { value: "manually_approved", label: "Manually approved" },
];

const START_HOUR = 8;
const END_HOUR = 20;
const HOUR_PX = 52;

function addDays(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function mondayOf(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const iso = js === 0 ? 6 : js - 1;
  return addDays(key, -iso);
}

function minutesOf(iso: string) {
  const h = Number(formatInTimeZone(new Date(iso), DISPLAY_TIMEZONE, "H"));
  const m = Number(formatInTimeZone(new Date(iso), DISPLAY_TIMEZONE, "m"));
  return h * 60 + m;
}

function dayKey(iso: string) {
  return formatInTimeZone(new Date(iso), DISPLAY_TIMEZONE, "yyyy-MM-dd");
}

function statusClass(status: BookingStatus) {
  if (status === "pending") return "bg-gold-soft text-ink ring-gold/40";
  if (status === "approved" || status === "manually_approved") return "bg-ink text-ivory ring-ink";
  if (status === "payment_failed") return "bg-error-soft text-error ring-error/30";
  return "bg-white text-muted ring-line";
}

export default function CalendarBoard() {
  const today = formatInTimeZone(new Date(), DISPLAY_TIMEZONE, "yyyy-MM-dd");
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [status, setStatus] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedDay, setSelectedDay] = useState(today);
  const [bookings, setBookings] = useState<AdminBookingListItem[] | null>(null);
  const [queue, setQueue] = useState<AdminBookingListItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    let active = true;
    setBookings(null);
    setError(null);
    fetchAllPages<AdminBookingListItem>("/admin/bookings", {
      status: status || undefined,
      include_archived: includeArchived,
      page_size: 100,
    })
      .then((rows) => {
        if (active) setBookings(rows);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't load bookings.");
      });
    fetchAllPages<AdminBookingListItem>("/admin/availability/resolution-queue", { page_size: 100 })
      .then((rows) => {
        if (active) setQueue(rows);
      })
      .catch(() => {
        if (active) setQueue([]);
      });
    return () => {
      active = false;
    };
  }, [status, includeArchived, reload]);

  const weekBookings = (bookings ?? []).filter((booking) => {
    const key = dayKey(booking.requested_start_time);
    return key >= weekStart && key <= days[6];
  });
  const dayBookings = weekBookings.filter((booking) => dayKey(booking.requested_start_time) === selectedDay);

  const toggle = (id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBatch = async (action: "approve" | "cancel" | "archive") => {
    if (!picked.size) return;
    setBatchNote(null);
    setError(null);
    try {
      const result = await adminBatchBookings([...picked], action);
      const failed = result.results.filter((row) => !row.ok);
      setBatchNote(failed.length ? `${failed.length} could not be updated (${failed.map((row) => row.error).filter(Boolean).join(", ")}).` : "Updated.");
      setPicked(new Set());
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "That batch action failed.");
    }
  };

  return (
    <div>
      <StudioTitle
        title="Calendar"
        sub="Solid blocks are the appointment. The hatched strip is the buffer held after it."
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              Previous
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setWeekStart(mondayOf(today)); setSelectedDay(today); }}>
              This week
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Next
            </Button>
          </div>
        }
      />

      {error ? <p className="mb-4 rounded-2xl bg-error-soft p-4 text-sm text-error" role="alert">{error}</p> : null}
      {queue.length ? <ResolutionQueue items={queue} onChanged={() => setReload((n) => n + 1)} /> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setStatus(item.value)}
            className={cn(
              "min-h-9 rounded-full px-3 text-xs font-semibold",
              status === item.value ? "bg-ink text-ivory" : "bg-white text-ink-soft ring-1 ring-line",
            )}
          >
            {item.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived
        </label>
      </div>

      {!bookings && !error ? <p className="mb-4 text-sm text-muted">Loading the week…</p> : null}

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line/70">
        <div className="grid min-w-[880px] grid-cols-[52px_repeat(7,1fr)]">
          <div />
          {days.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn("border-b border-line px-2 py-3 text-left", selectedDay === day && "bg-gold-soft/60")}
            >
              <span className="block text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
                {formatInTimeZone(new Date(`${day}T12:00:00Z`), DISPLAY_TIMEZONE, "EEE")}
              </span>
              <span className={cn("font-display text-2xl", day === today && "text-gold-deep")}>{day.slice(8)}</span>
            </button>
          ))}
          <div className="relative" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <span key={i} className="absolute right-2 text-[0.65rem] text-muted" style={{ top: i * HOUR_PX - 6 }}>
                {START_HOUR + i}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} className="relative border-l border-line" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * HOUR_PX }} />
              ))}
              {weekBookings
                .filter((booking) => dayKey(booking.requested_start_time) === day)
                .map((booking) => (
                  <Block key={booking.id} booking={booking} />
                ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-3xl">{formatInTimeZone(new Date(`${selectedDay}T12:00:00Z`), DISPLAY_TIMEZONE, "EEEE, MMM d")}</h2>
          {picked.size ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void runBatch("approve")}>Approve {picked.size}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => void runBatch("cancel")}>Cancel</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => void runBatch("archive")}>Archive</Button>
            </div>
          ) : null}
        </div>
        {batchNote ? <p className="mb-3 text-sm text-muted">{batchNote}</p> : null}
        {dayBookings.length === 0 ? <p className="text-sm text-muted">Nothing on this day.</p> : null}
        <div className="space-y-3">
          {dayBookings.map((booking) => (
            <Panel key={booking.id}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-2" checked={picked.has(booking.id)} onChange={() => toggle(booking.id)} aria-label={`Select ${booking.client.name}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/studio/bookings/${booking.id}`} className="font-display text-2xl hover:text-gold-deep">{booking.client.name}</Link>
                    <span className={cn("rounded-full px-2.5 py-1 text-[0.65rem] font-semibold tracking-wide uppercase ring-1", statusClass(booking.status))}>{booking.status.replaceAll("_", " ")}</span>
                    {booking.conflict_flag ? <span className="rounded-full bg-error-soft px-2.5 py-1 text-[0.65rem] font-semibold text-error uppercase">Conflict</span> : null}
                    {booking.is_archived ? <span className="text-xs text-muted">Archived</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatTime(booking.requested_start_time)} – {formatTime(booking.service_end_time)} · {booking.items.map((item) => item.service_name).join(", ") || "Service"}
                  </p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

function Block({ booking }: { booking: AdminBookingListItem }) {
  const open = START_HOUR * 60;
  const close = END_HOUR * 60;
  const start = Math.max(minutesOf(booking.requested_start_time), open);
  const serviceEnd = Math.max(start, Math.min(minutesOf(booking.service_end_time), close));
  const held = Math.max(serviceEnd, Math.min(minutesOf(booking.calendar_blocked_until), close));
  if (held <= open || start >= close) return null;
  const top = ((start - open) / 60) * HOUR_PX;
  const serviceHeight = Math.max(((serviceEnd - start) / 60) * HOUR_PX, 18);
  const bufferHeight = Math.max(((held - serviceEnd) / 60) * HOUR_PX, 0);
  return (
    <Link
      to={`/studio/bookings/${booking.id}`}
      className="absolute inset-x-1 z-10 overflow-hidden rounded-lg text-[0.65rem] leading-tight font-semibold"
      style={{ top, height: serviceHeight + bufferHeight }}
      title={booking.client.name}
    >
      <span className={cn("block px-1.5 py-1", statusClass(booking.status))} style={{ height: serviceHeight }}>
        {formatTime(booking.requested_start_time).replace(" CST", "")} {booking.client.name}
      </span>
      {bufferHeight > 0 ? (
        <span
          className="block bg-sand/80"
          style={{
            height: bufferHeight,
            backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(28,24,22,0.18) 3px, rgba(28,24,22,0.18) 4px)",
          }}
        />
      ) : null}
    </Link>
  );
}

function ResolutionQueue({ items, onChanged }: { items: AdminBookingListItem[]; onChanged: () => void }) {
  return (
    <Panel title="Resolution queue" className="mb-6 ring-gold">
      <p className="mb-4 text-sm text-muted">These approved bookings fall on a blocked day. Cancel one, or move it to a new time.</p>
      <div className="space-y-4">
        {items.map((booking) => (
          <QueueRow key={booking.id} booking={booking} onChanged={onChanged} />
        ))}
      </div>
    </Panel>
  );
}

function QueueRow({ booking, onChanged }: { booking: AdminBookingListItem; onChanged: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminResolveCancel(booking.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't cancel this booking.");
      setBusy(false);
    }
  };

  const move = async () => {
    if (!date || !time) return;
    setBusy(true);
    setError(null);
    try {
      await adminResolveReschedule(booking.id, reginaDateTimeToUtc(date, time));
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't move this booking.");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-cream p-3">
      <p className="font-medium">{booking.client.name}</p>
      <p className="text-sm text-muted">{formatDateTime(booking.requested_start_time)}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="New date" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} aria-label="New time" />
        <Button type="button" size="sm" disabled={busy || !date || !time} onClick={() => void move()}>Move</Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void cancel()}>Cancel booking</Button>
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
    </div>
  );
}
