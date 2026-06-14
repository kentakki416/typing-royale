variable "domain_name" {
  description = "ルートドメイン (例: typing-royale.com)。証明書の SAN ではなく fqdn 構築用"
  type        = string
}

variable "subdomain" {
  description = "サブドメイン (例: dev)。証明書は *.<subdomain>.<domain> のワイルドカードを発行"
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
