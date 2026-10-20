# 依赖许可初筛：当前安装版本

范围：本地单用户MVP的**直接依赖/运行组件**初筛，不是律师意见、完整transitive SBOM或商用合规批准。2026-10-14用户确认“个人使用”；本轮按当前个人、本机单用户运行范围核对，不扩大为公司或第三方软件服务授权。没有购买许可、迁移队列或升级镜像。

## 已确认：当前个人使用范围

- **Remotion/Player 4.0.534**：再次完整读取本机两份LICENSE.md，Free License Eligibility明确包含individual，Allowed use cases包含制作视频/图像；当前个人用途符合该免费资格，无需为此购买Company License。它不是MIT：禁止出售/出租/重新许可Remotion派生软件，资格与用途升级后必须重核。作品使用与出售派生软件是不同问题。
- **Redis 7.4.8**：不把客户端MIT或Redis8的AGPL套到此服务器。按RSALv2内部使用路径保留当前个人本机服务，不提供第三方Redis托管/转售服务；官方双许可公告的内部使用说明可交叉核对。未发现当前范围需要购买或迁移的依据，但未取得此轮官方条款全文，不冒充全面法律批准或商用SaaS审查。
- **FFmpeg与Noto**：保持既有GPL/OFL声明。本机使用及制作视频不等同打包分发二进制/字体；如分发程序需重新核对对应源码/NOTICE等义务。供应商音色、内容/专利与系统say权限仍不是本次批准范围，个人资格也不免LLM/TTS用量费用。
- 当前不购买许可、不换Valkey、不升级；未来用于公司/多人/收费软件服务或打包分发时重新核对主体、用途与具体许可。商用发布检查为条件性待办，不继续阻塞当前个人使用。

## 各组件证据与条件性待办

|组件|当前事实/证据|结论与待办|
|---|---|---|
|Remotion / Player 4.0.534|已完整读取 `node_modules/remotion/LICENSE.md` 与 `@remotion/player/LICENSE.md`，自定义两级许可，非MIT。已安装版本免费资格含个人、营利组织最多3名员工、非营利、非商业评估；禁止转售/再许可Remotion派生软件。|用户已确认个人使用，当前属于individual免费资格；并非仅凭单用户界面推定。免费资格外须Company License；组织/协作或分发用途改变须结合FAQ重核。未购买；升级5.0许可变化不能沿用4.x结论。|
|Redis服务端7.4.8|实际容器INFO确认；原 `redis:7-alpine` 当时解析到7.4.8，现Compose/隔离测试已固定 `redis:7.4.8-alpine@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065`，无升级。官方许可页列7.4–7.8为RSALv2或SSPLv1，而不是BSD。|当前个人本机使用按RSALv2内部使用路径保留；不提供第三方Redis服务。用途扩展再复核，不能用redis-py的MIT代替服务器许可。若要迁移Valkey仍需另行批准并隔离回归，当前不迁移。|
|FFmpeg9.0.2|实际 `ffmpeg -L` 声明GPLv3或以后；本项目用独立CLI。|当前本机安装与软件再分发有区别；打包该二进制须核对GPL声明/对应源码/构建配置。不能称当前构建LGPL。没有声称整个应用自动变GPL，也未做专利许可审查。|
|Noto Sans SC|`licenses/Noto-Sans-SC.txt`完整OFL1.1，仓库已有字体hash与声明。|保留版权/OFL；字体可嵌入作品，不单独卖字体，修改涉及保留名称限制。fontsource包包装许可与字体本体不同，渲染视频不因此继承OFL。|
|PostgreSQL16.13 / RustFS1.0.1|PG真实版本16.13；RustFS已固定digest、镜像label标Apache-2.0，既有真实存储联调。|PG及RustFS发行/依赖声明仍需随分发核对。RustFS非旧MinIO服务器，不能套用其许可；minio Python客户端的Apache2.0也不决定其他S3服务器许可。|

## 直接Python依赖（本地wheel metadata）

- jsonschema4.26.0、fastapi0.128.0：MIT。
- httpx0.28.1、python-dotenv1.2.1、websockets16.0、uvicorn0.40.0、celery5.6.2：BSD-3-Clause。
- psycopg/psycopg-binary3.3.3：LGPL-3.0-only，尤其打包binary wheel须保留相应条款/声明。
- redis-py5.3.1：MIT（客户端，不是Redis服务端）。
- minio7.2.20：Apache-2.0（S3客户端，不是MinIO服务器）。

本轮读取metadata而非声称审查完全部binary/transitive许可证；其余npm/系统/Chrome与供应商服务、音色商业权限尚待完整发布审查。macOS系统say只用于本地组件demo，不把其声音授权等同正式TTS合同。

## 来源与核验限制

- Remotion已安装版本两份完整LICENSE为4.0.534版本证据；[官方许可/价格](https://www.remotion.dev/docs/license/pricing)、[官方FAQ](https://convert.remotion.dev/docs/license/faq)。官方当前页面搜索结果还区分Creators/Automators，本次不把网页动态报价写成已购许可。
- [Redis官方版本许可说明](https://redis.io/legal/licenses/)：7.2及以前BSD，7.4–7.8 RSALv2/SSPLv1，8起新增AGPLv3选择；不能因8有AGPL而把7.4.8也标AGPL。
- [FFmpeg官方法律说明](https://www.ffmpeg.org/legal.html)；本机build许可用 `ffmpeg -L` 实证，发行义务需结合实际打包方式。
- 2026-10-14再取Remotion/Redis官网及Redis7.4.8原始LICENSE，被本机TUN/fake-IP地址安全检查拦截；不修改SSRF白名单、不绕过。Remotion以两份本机4.0.534完整LICENSE为主；官网搜索交叉核对个人免费资格及Redis内部使用说明：[Redis双许可公告](https://redis.io/blog/redis-adopts-dual-source-available-licensing/)、[Remotion许可FAQ](https://convert.remotion.dev/docs/license/faq)。搜索结果不是条款全文，商业software agreement也不当作RSAL合同证据。Redis容器常规目录未找到许可证副本，不假称已读其条款全文；当前官网全文/动态价目、完整第三方依赖和法律批准均未完成。

## 发布前尚缺

1. 当前已确认个人使用；如转公司/多人/第三方服务，重新确认主体/协作者、视频自动化用途与源代码/二进制分发。
2. 商用软件发布再确认Remotion与Redis许可适用；如需供应商书面答复先沟通，不替用户购买。
3. 当前已验收PG16.13/Redis7.4.8摘要固定和真实隔离PG/队列验证已完成；未来迁移/升级仍需单独批准、备份恢复与真实队列验证。固定digest不改变上述许可归属。
4. 发行包含全部需要的版权/许可证/NOTICE与binary对应源码义务；做完整传递依赖清单与供应商音色/内容权限核查。

状态：**当前个人使用范围已确认并完成适用初筛；不需为此购买Remotion Company License。商用软件/再分发合规仍为条件性待办**。没有取得法律或供应商全面合规批准。见[TODO](TODO.md)。
