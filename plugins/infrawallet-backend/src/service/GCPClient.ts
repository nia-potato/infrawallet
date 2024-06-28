import { CacheService, DatabaseService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { BigQuery } from '@google-cloud/bigquery';
import { reduce } from 'lodash';
import { InfraWalletClient } from './InfraWalletClient';
import { getCategoryByServiceName } from './functions';
import { CostQuery, Report } from './types';

export class GCPClient extends InfraWalletClient {
  static create(config: Config, database: DatabaseService, cache: CacheService, logger: LoggerService) {
    return new GCPClient('GCP', config, database, cache, logger);
  }

  convertServiceName(serviceName: string): string {
    let convertedName = serviceName;

    const prefixes = ['Google Cloud'];

    for (const prefix of prefixes) {
      if (serviceName.startsWith(prefix)) {
        convertedName = serviceName.slice(prefix.length).trim();
      }
    }

    return `${this.providerName}/${convertedName}`;
  }

  async initCloudClient(subAccountConfig: Config): Promise<any> {
    const keyFilePath = subAccountConfig.getString('keyFilePath');
    const projectId = subAccountConfig.getString('projectId');
    // Configure a JWT auth client
    const options = {
      keyFilename: keyFilePath,
      projectId: projectId,
    };

    // Initialize the BigQuery API
    const bigqueryClient = new BigQuery(options);

    return bigqueryClient;
  }

  async fetchCostsFromCloud(subAccountConfig: Config, client: any, query: CostQuery): Promise<any> {
    const projectId = subAccountConfig.getString('projectId');
    const datasetId = subAccountConfig.getString('datasetId');
    const tableId = subAccountConfig.getString('tableId');

    try {
      const periodFormat = query.granularity.toUpperCase() === 'MONTHLY' ? '%Y-%m' : '%Y-%m-%d';
      const sql = `
        SELECT
          project.name AS project,
          service.description AS service,
          FORMAT_TIMESTAMP('${periodFormat}', usage_start_time) AS period,
          SUM(cost) AS total_cost
        FROM
          \`${projectId}.${datasetId}.${tableId}\`
        WHERE
          project.name IS NOT NULL
          AND cost > 0
          AND usage_start_time >= TIMESTAMP_MILLIS(${query.startTime})
          AND usage_start_time <= TIMESTAMP_MILLIS(${query.endTime})
        GROUP BY
          project, service, period
        ORDER BY
          project, period, total_cost DESC`;

      // Run the query as a job
      const [job] = await client.createQueryJob({
        query: sql,
        location: 'US',
      });

      // Wait for the query to finish
      const [rows] = await job.getQueryResults();

      return rows;
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async transformCostsData(
    subAccountConfig: Config,
    _query: CostQuery,
    costResponse: any,
    categoryMappings: { [service: string]: string },
  ): Promise<Report[]> {
    const accountName = subAccountConfig.getString('name');
    const tags = subAccountConfig.getOptionalStringArray('tags');
    const tagKeyValues: { [key: string]: string } = {};
    tags?.forEach(tag => {
      const [k, v] = tag.split(':');
      tagKeyValues[k.trim()] = v.trim();
    });
    const transformedData = reduce(
      costResponse,
      (acc: { [key: string]: Report }, row) => {
        const period = row.period;
        const keyName = `${accountName}_${row.project}_${row.service}`;

        if (!acc[keyName]) {
          acc[keyName] = {
            id: keyName,
            name: `${this.providerName}/${accountName}`,
            service: this.convertServiceName(row.service),
            category: getCategoryByServiceName(row.service, categoryMappings),
            provider: this.providerName,
            reports: {},
            ...{ project: row.project }, // TODO: how should we handle the project field? for now, we add project name as a field in the report
            ...tagKeyValues, // note that if there is a tag `project:foo` in config, it overrides the project field set above
          };
        }

        acc[keyName].reports[period] = row.total_cost;

        return acc;
      },
      {},
    );

    return Object.values(transformedData);
  }
}
