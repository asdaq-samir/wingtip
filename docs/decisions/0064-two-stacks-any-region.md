# 0064. Two stacks: CloudFront's us-east-1 pieces apart, the rest in any Region

- **Date:** 2026-11-27
- **Status:** Accepted (the owner, 2026-11-27)
- **Amends:** the single us-east-1 stack of docs/README-AWS.md

## Context

The owner's AWS account is a project of the new AWS experience. Its
managed policies, which the account cannot change
([Regions for your projects](https://docs.aws.amazon.com/accounts/latest/reference/project-regions.html),
[managed policies](https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html)):

- Regional resources only in the project's Region, us-east-2 for a US
  address.
- In us-east-1, only partitional services (`UsEast1Partitional`): ACM,
  CloudFront, Route 53, WAF, Budgets, Service Quotas, CloudWatch Logs and
  CloudWatch's reads among them; not CloudFormation, CloudWatch's alarms,
  EventBridge or SNS.
- Spot denied (`DenySpotMarketType`, `DenyRequestSpotInstances`, a dry
  run confirmed it), and no OIDC provider made
  (`DenyIAMRestrictedActions`, `iam:*Provider*`), until the owner
  activates advanced features and those policies change. WAF on
  CloudFront is not offered either.

The template asserted us-east-1 (its `UsEast1` rule), because
CloudFront takes its certificate and a CLOUDFRONT-scope web ACL only
from there, so it could not be deployed on this account.

## Decision

- **`infra/cloudformation/template.yaml`** deploys in any Region
  (us-east-2 here): the VPC, the server, its disks, S3, Secrets Manager,
  ECR, the Fargate refresh, EventBridge, SNS, the alarms and the logs,
  and CloudFront, its Route 53 records, SES and the budget, as before.
  It takes CloudFront's certificate as `CertificateArn` and the web ACL
  as `WebAclArn` (empty, the default: off, decision 0063).
- **`infra/cloudformation/edge.yaml`**, in us-east-1, holds what must be
  there: the certificate and the `TileRateLimit` web ACL
  (`EdgeRateLimit`, default off), its ARNs as outputs.
- On a project account, which may not run CloudFormation in us-east-1,
  the certificate is requested with the AWS CLI (ACM and Route 53 are
  allowed there), four commands in README-AWS.md, "The first deploy";
  edge.yaml serves an ordinary account, or this one once its advanced
  features are on. A custom resource reaching us-east-1 from the main
  stack would keep one stack but needs Lambda code, its role and its
  waits; a certificate is made once and renews itself, so the CLI is the
  simpler of the two.
- Route 53's health check, its alarm and the ACM expiry rule are made
  only in a stack in us-east-1 (`UsEast1Alerts`): Route 53's figures and
  ACM's events for CloudFront's certificate reach CloudWatch and
  EventBridge there alone, and an alarm in us-east-2 would read no data
  as down for good.
- `ServerPricing` keeps its default (`spot`); its description says the
  project account denies Spot, and the deploy there passes `on-demand`.

## Consequences

- On the project account the stack is on demand in us-east-2, about $70
  a month rather than $35, until advanced features allow Spot.
- Without a health check through CloudFront there, `ChecksMissingAlarm`
  and `ServicesAlarm` see the server but not the path through
  CloudFront; AWS Health's mail warns of a certificate that cannot renew.
- GitHub's deploys (`promote.yml`, the OIDC deploy role) wait for the
  account's advanced features, which allow the OIDC provider:
  `CreateGitHubOidcProvider=none` makes neither the provider nor the
  role (a role trusting a provider that does not exist is refused), and
  until then the images and `deploy.sh` go by hand.
- The edge's rate limit, when turned on, needs edge.yaml in us-east-1,
  and on this account its advanced features.
- `CloudFrontPrefixListId` names the stack's Region's list of
  CloudFront's addresses, which differs by Region: its default is now
  us-east-2's, and its description gives the command for another.
