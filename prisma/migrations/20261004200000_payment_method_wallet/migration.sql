-- Bayar pesanan dari saldo dompet KOMIT.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'WALLET';
