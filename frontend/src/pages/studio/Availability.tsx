import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError } from "../../api/client";
import { adminBlockDay, adminBulkSetRecurringAvailability, adminListExceptions, adminListRecurringAvailability } from "../../api/endpoints";
import type { AvailabilityException } from "../../api/types";
import { errorMessage } from "../../lib/errors";
import { Button } from "../../ui/Button";
import { Panel, StudioTitle, inputCls } from "./StudioLayout";

const WEEKDAYS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

interface DayRow {
  enabled: boolean;
  start_time: string;
  end_time: string;
}

export default function Availability() {
  const [rows, setRows] = useState<Record<number, DayRow> | null>(null);
  const [blocked, setBlocked] = useState<AvailabilityException[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blockDate, setBlockDate] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockMessage, setBlockMessage] = useState<string | null>(null);

  const load = () => {
    adminListRecurringAvailability()
      .then((rules) => {
        const base: Record<number, DayRow> = {};
        for (const day of WEEKDAYS) base[day.value] = { enabled: false, start_time: "09:00", end_time: "17:00" };
        for (const rule of rules) {
          base[rule.day_of_week] = {
            enabled: true,
            start_time: rule.start_time.slice(0, 5),
            end_time: rule.end_time.slice(0, 5),
          };
        }
        setRows(base);
      })
      .catch(() => setError("Couldn't load weekly hours."));
    adminListExceptions()
      .then(setBlocked)
      .catch(() => setBlocked([]));
  };

  useEffect(load, []);

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminBulkSetRecurringAvailability(
        WEEKDAYS.filter((day) => rows[day.value].enabled).map((day) => ({
          day_of_week: day.value,
          start_time: `${rows[day.value].start_time}:00`,
          end_time: `${rows[day.value].end_time}:00`,
        })),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't save weekly hours.");
    } finally {
      setSaving(false);
    }
  };

  const block = async (event: FormEvent) => {
    event.preventDefault();
    if (!blockDate) return;
    setError(null);
    setBlockMessage(null);
    try {
      const result = await adminBlockDay(blockDate, blockReason.trim());
      setBlockMessage(
        result.conflicts.length
          ? `Day blocked. ${result.conflicts.length} approved booking${result.conflicts.length === 1 ? "" : "s"} moved to the resolution queue.`
          : "Day blocked. No approved bookings were affected.",
      );
      setBlockDate("");
      setBlockReason("");
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Couldn't block that day.");
    }
  };

  return (
    <div>
      <StudioTitle
        title="Availability"
        sub="Guest times come from these hours. Saving replaces the whole week — a day you turn off is removed. Monday is the first day."
      />
      {error ? <p className="mb-4 rounded-2xl bg-error-soft p-4 text-sm text-error">{error}</p> : null}
      {saved ? <p className="mb-4 rounded-2xl bg-gold-soft/70 p-4 text-sm">Weekly hours saved. Open times on the booking page follow this schedule.</p> : null}

      <Panel title="Weekly hours">
        {!rows ? <p className="text-sm text-muted">Loading hours…</p> : (
          <div className="space-y-3">
            {WEEKDAYS.map((day) => (
              <div key={day.value} className="flex flex-wrap items-center gap-3">
                <label className="flex w-36 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={rows[day.value].enabled}
                    onChange={(e) => setRows({ ...rows, [day.value]: { ...rows[day.value], enabled: e.target.checked } })}
                  />
                  {day.label}
                </label>
                <input
                  type="time"
                  disabled={!rows[day.value].enabled}
                  value={rows[day.value].start_time}
                  onChange={(e) => setRows({ ...rows, [day.value]: { ...rows[day.value], start_time: e.target.value } })}
                  className="rounded-lg border border-line px-2 py-1.5 text-sm disabled:opacity-40"
                />
                <span className="text-sm text-muted">to</span>
                <input
                  type="time"
                  disabled={!rows[day.value].enabled}
                  value={rows[day.value].end_time}
                  onChange={(e) => setRows({ ...rows, [day.value]: { ...rows[day.value], end_time: e.target.value } })}
                  className="rounded-lg border border-line px-2 py-1.5 text-sm disabled:opacity-40"
                />
              </div>
            ))}
          </div>
        )}
        <Button type="button" className="mt-5" disabled={saving || !rows} loading={saving} onClick={() => void save()}>
          Save weekly hours
        </Button>
      </Panel>

      <Panel title="Block a day" className="mt-4">
        <p className="mb-4 text-sm text-muted">The day closes immediately. Approved bookings that day wait in the resolution queue on the calendar.</p>
        <form onSubmit={block} className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-ink-soft">
            Date
            <input type="date" required value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className={`${inputCls} mt-1.5 font-normal`} />
          </label>
          <label className="min-w-48 flex-1 text-xs font-semibold text-ink-soft">
            Reason
            <input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Optional, only you see this" className={`${inputCls} mt-1.5 font-normal`} />
          </label>
          <Button type="submit" variant="secondary">Block day</Button>
        </form>
        {blockMessage ? <p className="mt-3 text-sm">{blockMessage}</p> : null}
        {blocked && blocked.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-muted">
            {blocked.map((day) => (
              <li key={day.id}>{day.date}{day.reason ? ` — ${day.reason}` : ""}</li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
