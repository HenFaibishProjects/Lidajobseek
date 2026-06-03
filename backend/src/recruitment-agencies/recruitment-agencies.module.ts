import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RecruitmentAgency } from './recruitment-agency.entity';
import { AgencyContact } from './agency-contact.entity';
import { AgencyInteraction } from './agency-interaction.entity';
import { User } from '../users/user.entity';
import { RecruitmentAgenciesService } from './recruitment-agencies.service';
import { RecruitmentAgenciesController } from './recruitment-agencies.controller';
import { AgencyContactsService } from './agency-contacts.service';
import { AgencyContactsController } from './agency-contacts.controller';
import { AgencyInteractionsService } from './agency-interactions.service';
import { AgencyInteractionsController } from './agency-interactions.controller';

@Module({
  imports: [MikroOrmModule.forFeature([RecruitmentAgency, AgencyContact, AgencyInteraction, User])],
  controllers: [RecruitmentAgenciesController, AgencyContactsController, AgencyInteractionsController],
  providers: [RecruitmentAgenciesService, AgencyContactsService, AgencyInteractionsService],
})
export class RecruitmentAgenciesModule {}
