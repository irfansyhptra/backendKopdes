import { Test, TestingModule } from '@nestjs/testing';
import { AIService } from './ai.service';
import { PrismaService } from '../../database/prisma.service';
import { QdrantService } from '../../qdrant/qdrant.service';
import { ConfigService } from '@nestjs/config';

describe('AIService', () => {
  let service: AIService;
  let prisma: PrismaService;

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    communitySuggestion: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    order: {
      count: jest.fn(),
    },
    uMKM: {
      findUnique: jest.fn(),
    },
  };

  const mockQdrantService = {
    searchDocuments: jest.fn(),
    upsertDocuments: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'GOOGLE_API_KEY') return 'mock-gemini-key';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: QdrantService, useValue: mockQdrantService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectInventoryAnomalies', () => {
    it('should calculate Expected Stock vs Actual Stock variance correctly', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          name: 'Beras Premium',
          stock: 15,
          inventoryTransactions: [
            { type: 'IN', quantity: 100 },
            { type: 'OUT', quantity: 70 },
          ], // Expected: 30, Actual: 15 -> Variance 15 (High Risk)
        },
      ];

      mockPrismaService.product.findMany.mockResolvedValue(mockProducts);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);

      const result = await service.detectInventoryAnomalies();
      expect(result.anomalies).toHaveLength(1);
      expect(result.anomalies[0].expectedStock).toBe(30);
      expect(result.anomalies[0].actualStock).toBe(15);
      expect(result.anomalies[0].variance).toBe(15);
      expect(result.anomalies[0].riskLevel).toBe('Tinggi');
      expect(result.highRiskCount).toBe(1);
    });
  });

  describe('getExecutiveDashboardSummary', () => {
    it('should aggregate highlights and summary metrics', async () => {
      mockPrismaService.product.count.mockResolvedValue(3);
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.communitySuggestion.count.mockResolvedValue(86);
      mockPrismaService.communitySuggestion.findMany.mockResolvedValue([
        { category: 'PUPUK', supporters: new Array(86) },
      ]);
      mockPrismaService.order.count.mockResolvedValue(42);

      const result = await service.getExecutiveDashboardSummary();
      expect(result.metrics.lowStockProductsCount).toBe(3);
      expect(result.metrics.topDemandCategory).toBe('PUPUK');
      expect(result.metrics.topDemandCount).toBe(86);
      expect(result.summaryHighlights).toBeDefined();
    });
  });
});
