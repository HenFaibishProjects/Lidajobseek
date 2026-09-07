import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MailCoverage } from './mail-coverage.entity';
import { MailCoverageController } from './mail-coverage.controller';
import { MailCoverageService } from './mail-coverage.service';
import { Process } from '../processes/process.entity';

@Module({
  imports: [MikroOrmModule.forFeature([MailCoverage, Process])],
  controllers: [MailCoverageController],
  providers: [MailCoverageService],
  exports: [MailCoverageService],
})
export class MailCoverageModule {}
