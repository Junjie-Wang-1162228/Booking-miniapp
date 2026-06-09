import { Module } from '@nestjs/common';
import { AdminClassesController, ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  controllers: [ClassesController, AdminClassesController],
  providers: [ClassesService],
  exports: [ClassesService]
})
export class ClassesModule {}
