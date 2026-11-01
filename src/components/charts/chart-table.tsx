import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

import { formatChartValue, formatDayLong, numericValue } from "./scale";
import type { DatumRow, SeriesDef, ValueFormat } from "./types";

export type ChartTableProps = {
  data: DatumRow[];
  series: SeriesDef[];
  format: ValueFormat;
  caption?: string;
  /** Zusätzliche Spalte „Total“ (gestapelte Daten). */
  total?: boolean;
};

/** Tabellen-Zwilling jedes Charts – jeder Wert ist ohne Hover erreichbar. Neueste Zeile zuerst. */
export function ChartTable({ data, series, format, caption, total }: ChartTableProps) {
  const rows = [...data].reverse();
  return (
    <Table>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <THead className="sticky top-0 bg-surface">
        <TR>
          <TH>Datum</TH>
          {series.map((s) => (
            <TH key={s.key} numeric>
              {s.label}
            </TH>
          ))}
          {total ? <TH numeric>Total</TH> : null}
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.date}>
            <TD className="font-mono text-[13px] whitespace-nowrap text-ink-muted tabular-nums">{formatDayLong(row.date)}</TD>
            {series.map((s) => (
              <TD key={s.key} numeric>
                {formatChartValue(numericValue(row, s.key), format)}
              </TD>
            ))}
            {total ? (
              <TD numeric className="font-medium">
                {formatChartValue(
                  series.reduce((sum, s) => sum + numericValue(row, s.key), 0),
                  format,
                )}
              </TD>
            ) : null}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
