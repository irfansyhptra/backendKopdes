import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { PAYMENT_METHODS, type MidtransMethod } from '../midtrans.types';

/**
 * Yang dikirim klien hanya pesanan mana dan metode apa.
 *
 * Tidak ada nominal, diskon, ongkir, maupun total di sini — semuanya dihitung
 * ulang backend dari database. Menerima angka dari klien berarti menerima
 * angka yang bisa diubah siapa pun lewat DevTools.
 */
export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'Pesanan wajib disebutkan.' })
  orderId!: string;

  @IsIn(PAYMENT_METHODS, {
    message: 'Metode pembayaran tidak didukung.',
  })
  paymentMethod!: MidtransMethod;
}
