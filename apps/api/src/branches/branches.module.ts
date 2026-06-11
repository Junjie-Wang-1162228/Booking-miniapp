import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminBranchesController, BranchesController } from './branches.controller';
import { BranchAccessService } from './branch-access.service';

@Module({
  imports: [PrismaModule],
  controllers: [BranchesController, AdminBranchesController],
  providers: [BranchAccessService],
  exports: [BranchAccessService]
})
export class BranchesModule {}
