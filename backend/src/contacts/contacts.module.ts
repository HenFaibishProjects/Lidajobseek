import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { Contact } from './contact.entity';

@Module({
  imports: [MikroOrmModule.forFeature([Contact])],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
