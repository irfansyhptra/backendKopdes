import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

// Alamat pengiriman milik pengguna yang sedang login.
// Tidak ada parameter userId di mana pun — selalu diambil dari token.
@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get()
  async list(@Req() req: any) {
    const addresses = await this.addressService.list(req.user.id);
    return { success: true, addresses };
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateAddressDto) {
    const address = await this.addressService.create(req.user.id, dto);
    return { success: true, message: 'Alamat ditambahkan', address };
  }

  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const address = await this.addressService.update(req.user.id, id, dto);
    return { success: true, message: 'Alamat diperbarui', address };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const result = await this.addressService.remove(req.user.id, id);
    return { success: true, message: 'Alamat dihapus', ...result };
  }
}
