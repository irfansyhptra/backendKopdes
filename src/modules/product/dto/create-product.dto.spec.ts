import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

describe('CreateProductDto multipart flags', () => {
  const fields = { name: 'Beras', description: 'Beras 5 kg', categoryId: 'category-1', price: '70000', stock: '10' };

  it.each([false, 'false'])('keeps disabled flags false (%s)', async (value) => {
    const dto = plainToInstance(CreateProductDto, { ...fields, isActive: value, isPreOrderAllowed: value });
    expect(dto.isActive).toBe(false);
    expect(dto.isPreOrderAllowed).toBe(false);
    expect(await validate(dto)).toEqual([]);
  });

  it('accepts enabled flags from multipart forms', async () => {
    const dto = plainToInstance(CreateProductDto, { ...fields, isActive: 'true', isPreOrderAllowed: 'true' });
    expect(dto.isActive).toBe(true);
    expect(dto.isPreOrderAllowed).toBe(true);
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects invalid flags instead of silently activating products', async () => {
    const dto = plainToInstance(CreateProductDto, { ...fields, isActive: 'invalid' });
    expect((await validate(dto)).some((error) => error.property === 'isActive')).toBe(true);
  });
});
