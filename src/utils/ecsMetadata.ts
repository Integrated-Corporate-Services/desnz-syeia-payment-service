// ECS Metadata Helper
// Captures AWS ECS task and container metadata for CloudWatch correlation

import http from 'http';

interface ECSMetadata {
  ecs_task_id?: string;
  ecs_task_arn?: string;
  ecs_cluster?: string;
  ecs_service?: string;
  ecs_container_instance_id?: string;
  aws_region?: string;
  availability_zone?: string;
}

let cachedMetadata: ECSMetadata | null = null;
let metadataFetchAttempted = false;

/**
 * Get ECS metadata from environment variables and metadata endpoint
 * Cached after first fetch to avoid repeated HTTP calls
 */
export async function getECSMetadata(): Promise<ECSMetadata> {
  // Return cached metadata if available
  if (cachedMetadata) {
    return cachedMetadata;
  }

  // If we already tried and failed, return empty object
  if (metadataFetchAttempted) {
    return {};
  }

  metadataFetchAttempted = true;

  const metadata: ECSMetadata = {
    aws_region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    ecs_cluster: process.env.ECS_CLUSTER,
    ecs_service: process.env.ECS_SERVICE_NAME,
  };

  // Try to fetch from ECS metadata endpoint (ECS Task Metadata Endpoint V4)
  const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  
  if (metadataUri) {
    try {
      // Fetch task metadata
      const taskMetadata = await fetchMetadataFromEndpoint(`${metadataUri}/task`);
      
      if (taskMetadata) {
        metadata.ecs_task_arn = taskMetadata.TaskARN;
        metadata.ecs_task_id = extractTaskIdFromArn(taskMetadata.TaskARN);
        metadata.availability_zone = taskMetadata.AvailabilityZone;
        
        // Extract cluster from task ARN if not set
        if (!metadata.ecs_cluster && taskMetadata.TaskARN) {
          metadata.ecs_cluster = extractClusterFromArn(taskMetadata.TaskARN);
        }
      }
    } catch (error) {
      // Silently fail - we're likely not in ECS
      // This is expected in local development
    }
  }

  cachedMetadata = metadata;
  return metadata;
}

/**
 * Fetch metadata from ECS metadata endpoint
 */
function fetchMetadataFromEndpoint(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 1000 }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Metadata endpoint timeout'));
    });
  });
}

/**
 * Extract task ID from task ARN
 * ARN format: arn:aws:ecs:region:account-id:task/cluster-name/task-id
 */
function extractTaskIdFromArn(arn: string): string | undefined {
  if (!arn) return undefined;
  const parts = arn.split('/');
  return parts[parts.length - 1];
}

/**
 * Extract cluster name from task ARN
 */
function extractClusterFromArn(arn: string): string | undefined {
  if (!arn) return undefined;
  const parts = arn.split('/');
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return undefined;
}

/**
 * Get synchronous ECS metadata (only from environment variables)
 * Use this when you can't await async function
 */
export function getECSMetadataSync(): ECSMetadata {
  return {
    aws_region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    ecs_cluster: process.env.ECS_CLUSTER,
    ecs_service: process.env.ECS_SERVICE_NAME,
    ecs_task_id: process.env.ECS_TASK_ID,
    ecs_task_arn: process.env.ECS_TASK_ARN,
  };
}
