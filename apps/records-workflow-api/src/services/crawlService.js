import { config } from '../config.js';
import { runFullPipelineForSystems } from './pipeline/pipelineOrchestratorService.js';

export async function runCrawl({
  systemName = null,
  systemId = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
  state = config.crawlState,
  maxDepth = config.crawl.maxDepth,
} = {}) {
  return runFullPipelineForSystems({
    systemName,
    systemId,
    facilityId,
    seedUrl,
    hospitalSystemIds,
    state,
    maxDepth,
    includeQuestionStage: true,
  });
}
