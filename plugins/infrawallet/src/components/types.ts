import { Report, Filters } from '../api/types';

export type TrendBarComponentProps = {
  categories: any[];
  series: Array<{ name: string; data: any[] }>;
  height?: number;
  width?: number;
};

export type MonthRange = {
  startMonth: Date;
  endMonth: Date;
};

export type TopbarComponentProps = {
  aggregatedBy: string;
  aggregatedBySetter: any;
  tags: string[];
  monthRange: MonthRange;
  monthRangeSetter: any;
};

export type FiltersComponentProps = {
  reports: Report[];
  filters: Filters;
  monthRange: MonthRange;
  filtersSetter: any;
  selectedTagsSetter: any;
  providerErrorsSetter: any;
};

export type QueryComponentProps = {
  filters: string;
  filtersSetter: any;
  groups: string;
  groupsSetter: any;
};

export type ColumnsChartComponentProps = {
  granularitySetter: any;
  categories: any[];
  series: Array<{ name: string; data: any[] }> | undefined;
  metrics?: Array<{ name: string; group?: string; data: any[] }>;
  height?: number;
  thumbnail?: boolean;
  dataPointSelectionHandler?: (event: any, chartContext: any, config: any) => void;
};

export type PieChartComponentProps = {
  categories: string[] | undefined;
  series: number[] | undefined;
  height?: number;
};

export type CostReportsTableComponentProps = {
  reports: Report[] | undefined;
  aggregatedBy: string;
  periods: string[];
};

export type Metric = {
  metricProvider: 'datadog' | 'grafanacloud';
  metricName: string;
  description?: string;
  query: string;
};

export type MetricCardProps = {
  metric: Metric;
  callback: Function;
};
