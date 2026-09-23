import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { KoperasiController } from './koperasi.controller';
import { KoperasiService } from './koperasi.service';
import {
  AdminKopdesProfileController,
  AdminMembershipController,
  MembershipController,
} from './membership.controller';
import { MembershipService } from './membership.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    KoperasiController,
    // Didaftarkan SETELAH KoperasiController: rute `koperasi/:id/members`
    // lebih spesifik daripada `koperasi/:id`, dan Nest memilih yang
    // terdaftar lebih dulu untuk pola yang bertabrakan.
    MembershipController,
    AdminMembershipController,
    AdminKopdesProfileController,
  ],
  providers: [KoperasiService, MembershipService],
  exports: [KoperasiService],
})
export class KoperasiModule {}
