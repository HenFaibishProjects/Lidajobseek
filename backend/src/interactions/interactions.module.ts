import { Module } from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { InteractionsController } from './interactions.controller';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Interaction } from './interaction.entity';
import { Contact } from '../contacts/contact.entity';
import { Process } from '../processes/process.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MikroOrmModule.forFeature([Interaction, Contact, Process]), MailModule],
  controllers: [InteractionsController],
  providers: [InteractionsService],
})
export class InteractionsModule {}
