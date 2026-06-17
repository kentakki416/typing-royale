import { UserRepository } from "../../../src/repository/prisma/user-repository"
import { RefreshTokenRepository } from "../../../src/repository/redis/refresh-token-repository"
import { deleteAccount } from "../../../src/service/user-service"
import { User } from "../../../src/types/domain"

const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()
const mockUserDelete = vi.fn<(_0: number) => Promise<void>>()
const mockDeleteAllByUserId = vi.fn<(_0: number) => Promise<void>>()

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  delete: mockUserDelete,
  findByEmail: vi.fn(),
  findById: mockFindById,
  update: vi.fn(),
}
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: vi.fn(),
  deleteAllByUserId: mockDeleteAllByUserId,
  findUserId: vi.fn(),
  save: vi.fn(),
}

const baseUser: User = {
  avatarUrl: null,
  canPublicRanking: true,
  createdAt: new Date(),
  githubUsername: "x",
  email: null,
  id: 7,
  updatedAt: new Date(),
}

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("User を削除し、Redis 上の全 Refresh Token を失効する", async () => {
      mockFindById.mockResolvedValue(baseUser)
      mockUserDelete.mockResolvedValue(undefined)
      mockDeleteAllByUserId.mockResolvedValue(undefined)

      const result = await deleteAccount(7, {
        refreshTokenRepository: mockRefreshTokenRepository,
        userRepository: mockUserRepository,
      })

      expect(result.ok).toBe(true)
      expect(mockUserDelete).toHaveBeenCalledWith(7)
      expect(mockDeleteAllByUserId).toHaveBeenCalledWith(7)
    })
  })

  describe("異常系", () => {
    it("対象ユーザーが存在しない場合、NOT_FOUND を返す（副作用なし）", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await deleteAccount(404, {
        refreshTokenRepository: mockRefreshTokenRepository,
        userRepository: mockUserRepository,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
      }
      expect(mockUserDelete).not.toHaveBeenCalled()
      expect(mockDeleteAllByUserId).not.toHaveBeenCalled()
    })
  })
})
