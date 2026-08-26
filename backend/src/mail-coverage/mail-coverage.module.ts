import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MailCoverage } from './mail-coverage.entity';
import { MailCoverageController } from './mail-coverage.controller';
import { MailCoverageService } from './mail-coverage.service';

@Module({
  imports: [MikroOrmModule.forFeature([MailCoverage])],
  controllers: [MailCoverageController],
  providers: [MailCoverageService],
})
export class MailCoverageModule {}
