variable "domain_name" {
  description = "ルートドメイン (例: typing-royale.com)。証明書の SAN ではなく fqdn 構築用"
  type        = string
}

variable "subdomain" {
  description = "環境サブドメイン。空文字なら *.<domain> を発行 (本番想定)、値があれば *.<subdomain>.<domain> を発行 (例: stg / dev)"
  type        = string
}

variable "zone_id" {
  description = "DNS 検証レコードを書き込む Route 53 hosted zone ID"
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
