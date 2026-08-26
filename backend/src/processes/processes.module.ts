import { Module } from '@nestjs/common';
import { ProcessesService } from './processes.service';
import { ProcessesController } from './processes.controller';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Process } from './process.entity';
import { User } from '../users/user.entity';
import { MailCoverageModule } from '../mail-coverage/mail-coverage.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([Process, User]),
    MailCoverageModule,
  ],
  controllers: [ProcessesController],
  providers: [ProcessesService],
})
export class ProcessesModule {}
