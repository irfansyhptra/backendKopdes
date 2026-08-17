import { Test, TestingModule } from '@nestjs/testing';
import { CommunityService } from './community.service';
import { PrismaService } from '../../database/prisma.service';

describe('CommunityService', () => {
  let service: CommunityService;
  let prisma: PrismaService;

  const mockPrismaService = {
    communitySuggestion: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    communitySuggestionSupport: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSuggestion', () => {
    it('should create suggestion and auto-add initial support from creator', async () => {
      const mockCreated = {
        id: 'sug-1',
        userId: 'user-1',
        productName: 'Pupuk Organik',
        category: 'PUPUK',
        description: 'Dibutuhkan untuk kelompok tani',
        user: { id: 'user-1', name: 'Pak Tani' },
        supporters: [{ userId: 'user-1' }],
        createdAt: new Date(),
      };

      mockPrismaService.communitySuggestion.create.mockResolvedValue(mockCreated);
      mockPrismaService.communitySuggestionSupport.create.mockResolvedValue({ id: 'sup-1' });
      mockPrismaService.communitySuggestion.findUnique.mockResolvedValue(mockCreated);

      const result = await service.createSuggestion(
        'user-1',
        'Pupuk Organik',
        'PUPUK',
        'Dibutuhkan untuk kelompok tani',
      );

      expect(result.productName).toBe('Pupuk Organik');
      expect(result.totalSupports).toBe(1);
      expect(prisma.communitySuggestionSupport.create).toHaveBeenCalled();
    });
  });

  describe('toggleSupport', () => {
    it('should toggle support off if already voted', async () => {
      const mockSuggestion = {
        id: 'sug-1',
        productName: 'Pupuk Organik',
        user: { name: 'Warga' },
        supporters: [],
      };
      mockPrismaService.communitySuggestion.findUnique.mockResolvedValue(mockSuggestion);
      mockPrismaService.communitySuggestionSupport.findUnique.mockResolvedValue({ id: 'sup-1' });
      mockPrismaService.communitySuggestionSupport.delete.mockResolvedValue({});

      const result = await service.toggleSupport('sug-1', 'user-1');
      expect(prisma.communitySuggestionSupport.delete).toHaveBeenCalledWith({
        where: { id: 'sup-1' },
      });
    });
  });
});
