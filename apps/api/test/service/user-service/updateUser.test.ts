import { UserRepository } from "../../../src/repository/prisma/user-repository"
import { updateUser } from "../../../src/service/user-service"
import { User } from "../../../src/types/domain"

const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()
const mockUpdate = vi.fn<
  (
    _0: number,
    _1: { canPublicRanking?: boolean; favoriteRepoUrl?: string | null },
  ) => Promise<User>
>()

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  delete: vi.fn(),
  findByEmail: vi.fn(),
  findByGithubUsername: vi.fn(),
  findById: mockFindById,
  findPublicProfile: vi.fn(),
  update: mockUpdate,
}

const baseUser: User = {
  avatarUrl: null,
  canPublicRanking: true,
  createdAt: new Date(),
  githubUsername: "Old",
  email: null,
  favoriteRepoUrl: null,
  id: 1,
  updatedAt: new Date(),
}

describe("updateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("favoriteRepoUrl を更新する", async () => {
      mockFindById.mockResolvedValue(baseUser)
      mockUpdate.mockResolvedValue({ ...baseUser, favoriteRepoUrl: "https://github.com/foo/bar" })

      const result = await updateUser(
        1,
        { favoriteRepoUrl: "https://github.com/foo/bar" },
        { userRepository: mockUserRepository },
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.favoriteRepoUrl).toBe("https://github.com/foo/bar")
      }
      expect(mockUpdate).toHaveBeenCalledWith(1, { favoriteRepoUrl: "https://github.com/foo/bar" })
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しない場合、NOT_FOUND を返す", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await updateUser(
        999,
        { favoriteRepoUrl: "https://github.com/foo/bar" },
        { userRepository: mockUserRepository },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })
})
