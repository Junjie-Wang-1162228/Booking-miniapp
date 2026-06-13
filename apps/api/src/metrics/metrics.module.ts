import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminMetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [PrismaModule, BranchesModule],
  controllers: [AdminMetricsController],
  providers: [MetricsService],
  exports: [MetricsService]
})
export class MetricsModule {}
