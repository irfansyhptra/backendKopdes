import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryService } from './delivery.service';
import { PrismaService } from '../../database/prisma.service';
import { DeliveryStatus, Role } from '@prisma/client';

describe('DeliveryService', () => {
  let service: DeliveryService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    delivery: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    deliveryLocation: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DeliveryService>(DeliveryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listCouriers', () => {
    it('should list all couriers with active load count', async () => {
      const mockCouriers = [
        { id: 'courier-1', name: 'Kurir Budi', email: 'budi@kopdes.id', phone: '0812' },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(mockCouriers);
      mockPrismaService.delivery.count.mockResolvedValue(2);

      const result = await service.listCouriers();
      expect(result).toHaveLength(1);
      expect(result[0].activeCount).toBe(2);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.COURIER },
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('markCourierDelivered (Dual Validation Step 1)', () => {
    it('should update delivery status to COURIER_DELIVERED and create notification', async () => {
      const mockDelivery = {
        id: 'del-1',
        courierId: 'courier-1',
        orderId: 'order-1',
        order: { customerId: 'cust-1' },
      };

      mockPrismaService.delivery.findUnique.mockResolvedValue(mockDelivery);
      mockPrismaService.delivery.update.mockResolvedValue({
        ...mockDelivery,
        status: DeliveryStatus.COURIER_DELIVERED,
      });

      const result = await service.markCourierDelivered('del-1', 'courier-1');
      expect(result.status).toBe(DeliveryStatus.COURIER_DELIVERED);
      expect(prisma.notification.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DUAL_VALIDATION_COURIER_DELIVERED',
        }),
      });
    });

    it('should throw error if courier ID does not match assigned courier', async () => {
      const mockDelivery = {
        id: 'del-1',
        courierId: 'courier-other',
        orderId: 'order-1',
      };
      mockPrismaService.delivery.findUnique.mockResolvedValue(mockDelivery);

      await expect(service.markCourierDelivered('del-1', 'courier-1')).rejects.toThrow(
        'Pengantaran ini tidak ditugaskan kepada Anda',
      );
    });
  });

  describe('updateCourierLocation', () => {
    it('should insert new delivery GPS location record', async () => {
      const mockDelivery = { id: 'del-1', courierId: 'courier-1' };
      mockPrismaService.delivery.findUnique.mockResolvedValue(mockDelivery);
      mockPrismaService.deliveryLocation.create.mockResolvedValue({
        id: 'loc-1',
        deliveryId: 'del-1',
        latitude: -7.75,
        longitude: 110.37,
      });

      const result = await service.updateCourierLocation('del-1', 'courier-1', -7.75, 110.37);
      expect(result.latitude).toBe(-7.75);
      expect(prisma.deliveryLocation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: 'del-1',
          latitude: -7.75,
          longitude: 110.37,
        }),
      });
    });
  });
});
