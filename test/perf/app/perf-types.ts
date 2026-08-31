/** What the chart last reported as active at the performance boundary. */
export interface ActiveReading {
  seriesId: string;
  sourceIndex: number;
  /** ISO instant, so the driver compares a string rather than a re-parsed Date. */
  time: string;
  y: number | null;
}
