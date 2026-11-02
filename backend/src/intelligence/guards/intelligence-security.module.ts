import { Global, Module } from '@nestjs/common';
import { IntelligenceOwnerGuard } from './intelligence-owner.guard';

@Global()
@Module({
  providers: [IntelligenceOwnerGuard],
  exports: [IntelligenceOwnerGuard],
})
export class IntelligenceSecurityModule {}
