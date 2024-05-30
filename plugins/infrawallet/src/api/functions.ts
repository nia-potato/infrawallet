import { Report } from './types';
import { reduce } from 'lodash';
import { parse, format, subMonths } from 'date-fns';

export const mergeCostReports = (
  reports: Report[],
  threshold: number,
): Report[] => {
  if (reports.length <= threshold) {
    return reports;
  }
  const totalCosts = [];
  reports.forEach(report => {
    let total = 0;
    Object.values(report.reports).forEach(v => {
      total += v as number;
    });
    totalCosts.push({ id: report.id, total: total });
  });
  const sortedTotalCosts = totalCosts.sort((a, b) => b.total - a.total);
  const idsToBeKept = sortedTotalCosts.slice(0, threshold).map(v => v.id);

  const mergedReports = reduce(
    reports,
    (acc, report) => {
      let keyName = 'others';
      if (idsToBeKept.includes(report.id)) {
        keyName = report.id;
      }
      if (!acc[keyName]) {
        acc[keyName] = {
          id: keyName,
          reports: {},
        };
      }

      Object.keys(report.reports).forEach(key => {
        if (acc[keyName].reports[key]) {
          acc[keyName].reports[key] += report.reports[key];
        } else {
          acc[keyName].reports[key] = report.reports[key];
        }
      });
      return acc;
    },
    {},
  );

  return Object.values(mergedReports);
};

export const aggregateCostReports = (
  reports: Report[],
  aggregatedBy?: string,
): Report[] => {
  const aggregatedReports = reduce(
    reports,
    (acc, report) => {
      let keyName = 'no value';
      if (aggregatedBy && aggregatedBy in report) {
        keyName = report[aggregatedBy];
      } else if (aggregatedBy === 'none') {
        keyName = 'Total cloud costs';
      }
      if (!acc[keyName]) {
        acc[keyName] = {
          id: keyName,
          reports: {},
        };
        acc[keyName][aggregatedBy] = keyName;
      }

      Object.keys(report.reports).forEach(key => {
        if (acc[keyName].reports[key]) {
          acc[keyName].reports[key] += report.reports[key];
        } else {
          acc[keyName].reports[key] = report.reports[key];
        }
      });
      return acc;
    },
    {},
  );
  return Object.values(aggregatedReports);
};

export const getAllReportTags = (reports: Report[]): string[] => {
  const tags = new Set<string>();
  const reservedKeys = [
    'id',
    'name',
    'service',
    'category',
    'provider',
    'reports',
  ];
  reports.forEach(report => {
    Object.keys(report).forEach(key => {
      if (reservedKeys.indexOf(key) === -1) {
        tags.add(key);
      }
    });
  });
  return Array.from(tags);
};

export const getPreviousMonth = (month: string): string => {
  const date = parse(month, 'yyyy-MM', new Date());
  const previousMonth = subMonths(date, 1);
  return format(previousMonth, 'yyyy-MM');
};
