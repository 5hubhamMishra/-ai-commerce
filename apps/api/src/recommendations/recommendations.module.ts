import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { BehavioralScoringService } from './behavioral-scoring.service';
import { CollaborativeService } from './collaborative.service';
import { EvaluationService } from './evaluation.service';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [EmbeddingsModule],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    CollaborativeService,
    BehavioralScoringService,
    EvaluationService,
  ],
  // EvaluationService is consumed directly by Phase 10's AnalyticsModule
  // (recommendation analytics / business insights) — same "export what a
  // later phase needs" precedent as RecommendationsService itself.
  exports: [RecommendationsService, EvaluationService],
})
export class RecommendationsModule {}
