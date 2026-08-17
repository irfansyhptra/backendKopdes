import { IsBoolean, IsOptional, IsString } from 'class-validator';

// Admin Kopdes menurunkan (takedown) atau menayangkan kembali produk UMKM mitra.
export class TakedownProductDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
