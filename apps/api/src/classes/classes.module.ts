import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { AdminClassesController, ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [BranchesModule],
  controllers: [ClassesController, AdminClassesController],
  providers: [ClassesService],
  exports: [ClassesService]
})
export class ClassesModule {}
