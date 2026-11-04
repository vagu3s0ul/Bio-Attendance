/**
 * Web stub: SheetJS is skipped in the web bundle (it pulls in Node built-ins
 * that break expo's webpack build). The native build parses binary Excel; on
 * web the caller falls back to CSV and tells the user.
 */
import type { CsvEntry } from './fees';

export function parseXlsxSpreadsheet(): CsvEntry[] {
  throw new Error('The web build cannot parse XLS/XLSX files. Export the sheet as CSV instead.');
}