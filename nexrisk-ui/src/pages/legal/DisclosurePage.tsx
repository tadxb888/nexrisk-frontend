import { LegalPage } from './LegalPage';

const CONTENT = `# Risk Disclosure

**Last updated: 08 July 2026**

This Risk Disclosure applies to the Taiga platform ("**Platform**"), operated by **Forsa Ltd** ("**Forsa**", "**we**", "**us**"), a company registered in England and Wales under company number **17288614**, registered office 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom. "**Taiga**" is a trading name of Forsa Ltd.

Please read this Risk Disclosure carefully. It should be read together with our **Terms of Use** and **Privacy Policy**. By using the Platform you acknowledge and accept the risks described below.

---

## 1. The Platform is a tool, not advice

1.1 Taiga is a **risk-management technology platform**. It presents data and executes configurations that you define. It does **not** provide investment advice, financial advice, trading signals, or recommendations, and nothing on the Platform should be construed as a solicitation or inducement to enter into any transaction.

1.2 Forsa is a technology provider. It is not a broker, dealer, adviser, counterparty or execution venue, and it does not execute trades, hold client funds, or manage positions on your behalf. All operational, trading, hedging and risk decisions are made by you and remain entirely your responsibility.

1.3 **Regulatory status.** Forsa supplies software and does not carry on any regulated financial-services activity, provide investment or financial advice, execute transactions, or hold client funds. Forsa is not required to hold, and does not hold, authorisation from the Financial Conduct Authority or any other financial regulator.

1.4 **Deployment on your own infrastructure.** Taiga is licensed software deployed and operated on the Client's own infrastructure. It is not a hosted, cloud, SaaS or PaaS service. Forsa does not host the Platform, and does not hold your operational or trading data. You operate the environment in which the Platform runs.

---

## 2. FX and CFD trading involves significant risk

2.1 The Platform is used in connection with foreign-exchange (FX) and contract-for-difference (CFD) activity. FX and CFD instruments are **complex and carry a high level of risk**. They are typically leveraged, meaning that losses can accumulate rapidly and may exceed the capital committed.

2.2 Market prices can move sharply and unpredictably. Liquidity can deteriorate, spreads can widen, and orders may be executed at prices materially different from those displayed. Past performance and historical data are not a reliable indicator of future results.

2.3 Using the Platform does **not** reduce, eliminate or hedge away the inherent risks of trading. Risk-management tooling can support decision-making, but it cannot guarantee any particular outcome, prevent losses, or protect against adverse market events.

---

## 3. Data accuracy, latency and availability

3.1 The Platform displays prices, quotes, liquidity-provider data, exposure figures, analytics and other information, some of which originates from third parties. This information is provided **"as is" and "as available"** and may be **delayed, incomplete, inaccurate, or interrupted**.

3.2 Values shown on the Platform are indicative. Displayed figures may differ from the values recorded by your trading systems, liquidity providers or execution venues, which are authoritative. You should not rely on any single figure, indicator or Platform output as the sole basis for a decision, and should independently verify information before acting.

3.3 Data feeds, connectivity, servers and third-party services within your deployment may fail or become unavailable. Because the Platform runs on your own infrastructure, the availability and integrity of the deployed instance are your responsibility. You should maintain your own independent controls, monitoring, backups and fallback procedures and must not depend solely on the Platform for critical risk monitoring.

---

## 4. Automated rules, hedging logic and configuration risk

4.1 The Platform allows you to configure hedging rules, thresholds, alerts and automated logic. These execute according to the parameters **you** set. Incorrect, incomplete or unsuitable configuration can produce unintended results, including unhedged exposure or unintended hedging activity.

4.2 Automated and rules-based processing carries model risk, latency risk and execution risk. Rules operate on the data available to them, which may be delayed or erroneous, and may behave unexpectedly during abnormal market conditions, gaps, or connectivity failures.

4.3 You are responsible for testing, validating, monitoring and reviewing any configuration you deploy, and for maintaining appropriate human oversight. Forsa is not responsible for outcomes arising from the parameters you choose.

---

## 5. Operational and technology risk

5.1 As with any software, the Platform may contain defects or errors and may behave unexpectedly.

5.2 Because the Platform is deployed on your own infrastructure, you are responsible for the provisioning, configuration, security, patching, backup, business-continuity and operation of the environment in which it runs, including servers, databases, networking and credential management. Forsa does not operate or monitor your environment.

5.3 The Platform provides security features (such as access controls, multi-factor authentication and encryption of sensitive credentials at rest) for you to configure and operate. Their effectiveness depends on how you deploy and manage your instance.

---

## 6. Your own responsibilities and regulatory obligations

6.1 You (and your organisation) remain solely responsible for your business, including compliance with all laws and regulatory requirements applicable to you, your clients, and your trading and hedging activities.

6.2 Where you serve your own clients, you are responsible for providing them with any risk warnings, disclosures and protections required by the rules applicable to you. This Risk Disclosure covers your use of the Platform only and is not a substitute for any disclosure you are required to give to your own clients.

---

## 7. No guarantee

7.1 We make no representation or warranty that the Platform will be accurate, error-free, uninterrupted, or fit for any particular purpose, and we do not guarantee any financial or operational outcome from its use.

7.2 To the fullest extent permitted by law, Forsa accepts no liability for any trading, hedging or investment losses, or for any loss arising from reliance on the data, outputs or configurations of the Platform, or from the operation of your deployment environment. The full exclusion and limitation of liability is set out in the **Terms of Use**.

---

## 8. Acknowledgement

By using the Platform, you confirm that you understand the nature of FX and CFD activity and the associated risks, that you understand the Platform is a tool and not advice, that you operate it on your own infrastructure, and that you accept responsibility for your own decisions and for verifying information before acting on it.

---

## Contact

**Forsa Ltd** (trading as Taiga)
71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom
Telephone: +1 888 301 6002
Email: info@taigahedge.com
`;

export function DisclosurePage() {
  return <LegalPage content={CONTENT} />;
}