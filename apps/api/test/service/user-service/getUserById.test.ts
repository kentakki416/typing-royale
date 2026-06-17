import { UserRepository } from "../../../src/repository/prisma/user-repository"
import { getUserById } from "../../../src/service/user-service"
import { User } from "../../../src/types/domain"

const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  delete: vi.fn(),
  findByEmail: vi.fn(),
  findById: mockFindById,
  update: vi.fn(),
}

describe("getUserById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ユーザーが存在する場合、ok: true とユーザー情報を返す", async () => {
      const mockUser: User = {
        avatarUrl: "https://example.com/avatar.jpg",
        canPublicRanking: true,
        createdAt: new Date(),
        githubUsername: "Test User",
        email: "test@example.com",
        id: 1,
        updatedAt: new Date(),
      }

      mockFindById.mockResolvedValue(mockUser)

      const result = await getUserById(1, { userRepository: mockUserRepository })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual(mockUser)
      }
      expect(mockFindById).toHaveBeenCalledWith(1)
      expect(mockFindById).toHaveBeenCalledTimes(1)
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しない場合、ok: false と NOT_FOUND エラーを返す", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await getUserById(999, { userRepository: mockUserRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe("NOT_FOUND")
        expect(result.error.statusCode).toBe(404)
      }
      expect(mockFindById).toHaveBeenCalledWith(999)
      expect(mockFindById).toHaveBeenCalledTimes(1)
    })

    it("データベースエラー時にエラーをスローする", async () => {
      mockFindById.mockRejectedValue(new Error("Database connection failed"))

      await expect(getUserById(1, { userRepository: mockUserRepository })).rejects.toThrow()
      expect(mockFindById).toHaveBeenCalledWith(1)
    })
  })
})
