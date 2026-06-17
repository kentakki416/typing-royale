import { GithubUserInfo, IGithubOAuthClient } from "../../../src/client/github-oauth"
import { AuthAccountRepository } from "../../../src/repository/prisma/auth-account-repository"
import {
  TransactionContext,
  TransactionRunner,
} from "../../../src/repository/prisma/transaction-runner"
import { UserRepository } from "../../../src/repository/prisma/user-repository"
import { RefreshTokenRepository } from "../../../src/repository/redis/refresh-token-repository"
import { authenticateWithGithub } from "../../../src/service/auth-service"
import { AuthAccountWithUser, User } from "../../../src/types/domain"

const mockGetUserInfo = vi.fn<(_0: string, _1: string) => Promise<GithubUserInfo>>()
const mockGithubOAuthClient: IGithubOAuthClient = {
  getUserInfo: mockGetUserInfo,
}

const mockFindByProvider = vi.fn<(_0: string, _1: string) => Promise<AuthAccountWithUser | null>>()
const mockAuthAccountCreate = vi.fn<(
  _0: Parameters<AuthAccountRepository["create"]>[0],
  _1?: TransactionContext,
) => Promise<unknown>>()
const mockAuthAccountRepository: AuthAccountRepository = {
  create: mockAuthAccountCreate as never,
  findByProvider: mockFindByProvider,
}

const mockUserCreate = vi.fn<(
  _0: Parameters<UserRepository["create"]>[0],
  _1?: TransactionContext,
) => Promise<User>>()
const mockUserRepository: UserRepository = {
  create: mockUserCreate,
  delete: vi.fn(),
  findByEmail: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
}

const mockRefreshTokenSave = vi.fn<(_0: string, _1: number, _2: number) => Promise<void>>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: vi.fn(),
  deleteAllByUserId: vi.fn(),
  findUserId: vi.fn(),
  save: mockRefreshTokenSave,
}

const mockTransactionRunner: TransactionRunner = {
  run: vi.fn(async (fn) => fn(undefined as unknown as TransactionContext)),
}

const mockRepository = {
  authAccountRepository: mockAuthAccountRepository,
  refreshTokenRepository: mockRefreshTokenRepository,
  transactionRunner: mockTransactionRunner,
  userRepository: mockUserRepository,
}

const mockTokenGenerators = {
  generateAccessToken: vi.fn((_userId: number) => "access.jwt"),
  generateRefreshToken: vi.fn((_userId: number) => ({ jti: "uuid-1", token: "refresh.jwt" })),
}

const REDIRECT_URI = "http://localhost:3000/api/auth/callback/github"

describe("authenticateWithGithub", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("既存ユーザーの場合、isNewUser=false で Access/Refresh Token を発行する", async () => {
      const mockGithubUser: GithubUserInfo = {
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        id: "12345",
        login: "octocat",
        name: "The Octocat",
      }

      const mockExistingUser: User = {
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        canPublicRanking: true,
        createdAt: new Date(),
        githubUsername: "The Octocat",
        email: null,
        id: 1,
        updatedAt: new Date(),
      }

      const mockExistingAccount: AuthAccountWithUser = {
        createdAt: new Date(),
        id: 1,
        provider: "github",
        providerAccountId: "12345",
        updatedAt: new Date(),
        user: mockExistingUser,
        userId: 1,
      }

      mockGetUserInfo.mockResolvedValue(mockGithubUser)
      mockFindByProvider.mockResolvedValue(mockExistingAccount)

      const result = await authenticateWithGithub(
        { code: "auth-code", redirectUri: REDIRECT_URI },
        mockRepository,
        mockGithubOAuthClient,
        mockTokenGenerators,
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          accessToken: "access.jwt",
          isNewUser: false,
          refreshToken: "refresh.jwt",
          user: mockExistingUser,
        })
      }
      expect(mockGetUserInfo).toHaveBeenCalledWith("auth-code", REDIRECT_URI)
      expect(mockTransactionRunner.run).not.toHaveBeenCalled()
      expect(mockUserCreate).not.toHaveBeenCalled()
      expect(mockAuthAccountCreate).not.toHaveBeenCalled()
      expect(mockRefreshTokenSave).toHaveBeenCalledWith("uuid-1", 1, expect.any(Number))
    })

    it("新規ユーザーの場合、name が無ければ login を githubUsername に採用する", async () => {
      const mockGithubUser: GithubUserInfo = {
        avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
        id: "67890",
        login: "newoctocat",
        name: null,
      }

      const mockNewUser: User = {
        avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
        canPublicRanking: true,
        createdAt: new Date(),
        githubUsername: "newoctocat",
        email: null,
        id: 2,
        updatedAt: new Date(),
      }

      mockGetUserInfo.mockResolvedValue(mockGithubUser)
      mockFindByProvider.mockResolvedValue(null)
      mockUserCreate.mockResolvedValue(mockNewUser)
      mockAuthAccountCreate.mockResolvedValue(undefined)

      const result = await authenticateWithGithub(
        { code: "auth-code", redirectUri: REDIRECT_URI },
        mockRepository,
        mockGithubOAuthClient,
        mockTokenGenerators,
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          accessToken: "access.jwt",
          isNewUser: true,
          refreshToken: "refresh.jwt",
          user: mockNewUser,
        })
      }
      expect(mockTransactionRunner.run).toHaveBeenCalledTimes(1)
      expect(mockUserCreate).toHaveBeenCalledWith(
        {
          avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
          githubUsername: "newoctocat",
        },
        undefined,
      )
      expect(mockAuthAccountCreate).toHaveBeenCalledWith(
        {
          provider: "github",
          providerAccountId: "67890",
          userId: 2,
        },
        undefined,
      )
    })
  })

  describe("異常系", () => {
    it("GitHub 認証エラー時に例外が伝播する", async () => {
      mockGetUserInfo.mockRejectedValue(new Error("network"))

      await expect(
        authenticateWithGithub(
          { code: "invalid", redirectUri: REDIRECT_URI },
          mockRepository,
          mockGithubOAuthClient,
          mockTokenGenerators,
        ),
      ).rejects.toThrow()
    })
  })
})
