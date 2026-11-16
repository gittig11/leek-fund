## 开发

## 2026-11-16 使用 vscode 1.146.0

```bash
# 安装依赖
yarn

# 打包得到.vsix文件
yarn package
```


## 2026-11-15 feat: 完善当前项目代码，支持拖拽移动子目录

### 设计要点

- 为 `StockProvider` / `FundProvider` 实现 `TreeDragAndDropController<LeekTreeItem>`，只允许拖拽**分组节点**（`isCategory === true`）
- 用自定义 mime（`application/vnd.code.tree.leekfundview.stock.groups`）在 `handleDrag` 中携带被拖拽的分组节点，`handleDrop` 中读取
- 落点语义：拖到某个分组上 → 插入到该分组之前；拖到空白处 → 移到末尾
- 重新排序时对 `globalState.stockGroups` 与 `globalState.stockLists` 成对 `splice`（两个数组必须保持同下标一一对应），再通过 `LeekFundConfig.setConfig` 持久化并 `refresh()`


### 改动说明

#### 1. [stockProvider.ts](file:///d:/dev/os-projects/leek-fund/src/explorer/stockProvider.ts)

`StockProvider` 现在同时实现 `TreeDataProvider` 与 `TreeDragAndDropController<LeekTreeItem>`：

- **MIME 类型**：`application/vnd.code.tree.leekfundview.stock.groups`，用于在本树内部传递被拖拽的分组节点。`dragMimeTypes` / `dropMimeTypes` 都声明它。
- **`handleDrag`**：只把 `isCategory === true` 的分组节点写入 `dataTransfer`。这样拖拽普通股票条目时不会携带任何数据，`handleDrop` 自然不会执行移动，避免误操作。
- **`handleDrop`**：核心排序逻辑
  1. 从 `dataTransfer` 取出源节点，解析 `id`（`stockGroup_<index>`）得到 `fromIndex`，并做越界校验
  2. 计算插入位：拖到某个分组上 → 插到该分组**之前**；拖到列表空白处（`target === undefined`）→ 移到**末尾**
  3. 关键的一步是 `fromIndex < targetIndex` 时目标下标要 **-1**：因为源元素先从数组里被移除，后面的元素整体前移了一位
  4. `globalState.stockGroups` 与 `globalState.stockLists` **成对** `splice`（先各删一个、再各插一个），保证"分组名 ↔ 股票代码数组"下标始终一一对应——这是本项目数据结构最容易踩坑的地方
  5. 通过 `LeekFundConfig.setConfig` 写入 `leek-fund.stockGroups` / `leek-fund.stocks` 持久化，最后 `refresh()`

#### 2. [fundProvider.ts](file:///d:/dev/os-projects/leek-fund/src/explorer/fundProvider.ts)

与股票完全同构，只是数据换成 `globalState.fundGroups` / `globalState.fundLists`，配置键换成 `leek-fund.fundGroups` / `leek-fund.funds`，ID 前缀换成 `fundGroup_`，MIME 独立为 `...fund.groups`，避免两个视图互相干扰。

#### 3. [extension.ts](file:///d:/dev/os-projects/leek-fund/src/extension.ts#L84-L95)

在 `window.createTreeView` 时挂上 `dragAndDropController: nodeXxxProvider`。注意这里**故意没有开启 `canSelectMany`**：多选拖拽在"排序"语义下容易产生歧义（多个源节点如何相对定位），保持单选拖拽更符合直觉。

### 行为边界

| 场景 | 结果 |
|---|---|
| A 拖到 B 上 | A 插入到 B 之前 |
| A 拖到根空白区 | A 移到末尾 |
| 拖到自身/相邻下一位 | `insertIndex === fromIndex`，直接 return，无副作用 |
| 只有一个分组 | 拖到空白 → 位置不变，直接 return |
| 拖拽普通股票/基金条目 | `handleDrag` 不写数据，`handleDrop` 取不到数据，直接 return |

### 验证方式

```bash
cd /d d:\dev\os-projects\leek-fund
npm run compile
```

然后 F5 启动调试实例，在侧边栏拖动 `US(4)`、`HK(15)`、`医药(33)` 等分组，松手后顺序应立即变化，并可在 `settings.json` 的 `leek-fund.stockGroups` 里看到顺序被持久化。

### 一点延伸提示

分组 ID 是**按数组下标生成**的（`stockGroup_0`、`stockGroup_1`…），所以重排后所有分组的 ID 都会变。这带来两个副作用：

- 分组的展开/折叠状态会重置（VS Code 用 `id` 记忆折叠状态）
- `FundService` 里按 groupIndex 缓存盈亏的 `amountRefreshCount` / `fundCodesSet` 会被打乱，但下一轮轮询会重新拉取，不影响数据正确性

如果后续想避免折叠状态丢失，可以把 ID 从下标改为稳定标识（比如分组名或 UUID），但那需要一并改造 `LeekFundConfig` 里所有 `parseInt(groupId.replace(...))` 的解析逻辑，属于一次较大的重构，建议作为独立需求评估。



## 接口说明

> 需要学习开发的可以了解

### 爬取基金基本概况信息

```
http://fund.eastmoney.com/f10/jbgk_001632.html
```

只需要获取基金名称可以走 js，jsonp

```
http://fundgz.1234567.com.cn/js/001632.js?rt=1596338178723
```

### 基金持仓股票涨跌情况

```
https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f12,f14,f9&secids=0.000661,1.603259,0.300142,0.300122,0.002007,0.300601,1.600201,0.300529,0.300676,1.600867,&_=1599742806408
```

html 数据

```
 http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=161726&topline=10&year=&month=&rt=0.3585181467435923
```

页面逻辑

```
http://j5.dfcfw.com/js/f10/f10_min_20200220153807.js
```

### 爬取净值接口

```

// 历史净值
http://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=001632&page=1&&sdate=2020-07-31

股票实时数据
// 比如A股：
https://hq.sinajs.cn/list=sh000001

// 比如港股
https://stock.xueqiu.com/v5/stock/batch/quote.json?symbol=HKHSI,00700

// 基金实时数据（有几分钟延迟，插件基金数据使用的是此接口）
// 比如诺安成长混合
http://fundgz.1234567.com.cn/js/320007.js?callback=a

// 天天基金 app
https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=50&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=ssdfsdfsdf&Fcodes=320007,161726

```

### 图片

```

// 走势图片、[沪深拼音]/time/[图片大小]/[股票代码]
http://img1.money.126.net/chart/hs/time/210x140/1399001.png

```

### 基金代码列表

```

http://fund.eastmoney.com/js/fundcode_search.js

```

### 基金排行榜

```

http://vip.stock.finance.sina.com.cn/fund_center/data/jsonp.php/IO.XSRV2.CallbackList['hLfu5s99aaIUp7D4']/NetValueReturn_Service.NetValueReturnOpen?page=1&num=40&sort=form_year&asc=0&ccode=&type2=0&type3=

```

### 基金走势图

```

// 近期走势
https://image.sinajs.cn/newchart/v5/fund/nav/ss/150206.gif

```

## 开发

```

// 官方插件文档介绍
https://code.visualstudio.com/api/extension-guides/overview

// Python 爬取历史基金数据
https://blog.csdn.net/yuzhucu/article/details/55261024

// 发布流程
https://blog.csdn.net/Suwanqing_su/article/details/105947156

// 开发系列博文
http://blog.haoji.me/vscode-plugin-overview.html

```

## 基金接口

标签（空格分隔）： 个人项目

---

#### 数据接口

> 数据来源 蛋卷基金&天天基金

- 获取基金净值

地址:https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo

请求方式:POST

参数列表
| 参数名 | 参数类型 |默认值|
| ------------ | ------------ |--|
| plat | String |Android|
| deviceid | String ||
| product | String |EFund|
| Version | String |6.2.4|
| Fcodes | String |基金编码,多个使用,隔开|
|appType|String|ttjj|

返回值

```json
{
  "Datas": [
    {
      "FCODE": "005919",
      "SHORTNAME": "天弘中证500指数C",
      "PDATE": "2020-04-29",
      "NAV": "0.9214",
      "ACCNAV": "0.9214",
      "NAVCHGRT": "0.01",
      "GSZ": "0.9427",
      "GSZZL": "2.31",
      "GZTIME": "2020-04-30 15:00",
      "NEWPRICE": "--",
      "CHANGERATIO": "--",
      "ZJL": "--",
      "HQDATE": "--",
      "ISHAVEREDPACKET": false
    }
  ],
  "ErrCode": 0,
  "Success": true,
  "ErrMsg": null,
  "Message": null,
  "ErrorCode": "0",
  "ErrorMessage": null,
  "ErrorMsgLst": null,
  "TotalCount": 8,
  "Expansion": {
    "GZTIME": "2020-04-30",
    "FSRQ": "2020-04-29"
  }
}
```

返回值含义
|字段名|含义|
|-|-|
|PDATE|最新的净值日期|
|NAV|最新净值|
|NAVCHGRT|最新的净值涨了多少|
|GSZ|估值|
|GSZZL|估值涨了多少|
|GZTIME|估值的日期|

```
https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=11&appType=ttjj&product=EFund&plat=Android&deviceid=9e16077fca2fcr78ep0ltn98&Version=1&Fcodes=161725,377240,002207,270023
```

- 获取基金历史净值

地址:https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList

请求方式:POST

参数列表
| 参数名 | 参数类型 |默认值|
| ------------ | ------------ |--|
|FCODE|String|基金编码|
|pageSize|int|数据一页多少个|
|deviceid|String|设备 id|
|version|String|版本名|
|pageIndex|int|页码 从 1 开始|
|plat|String|Android|

返回值

```
{
    "Datas": [
        {
            "FSRQ": "2020-04-29",
            "DWJZ": "0.9214",
            "JZZZL": "0.0109",
            "LJJZ": "0.9214",
            "NAVTYPE": "1",
            "RATE": "--",
            "MUI": "--",
            "SYI": "--"
        }
    ],
    "ErrCode": 0,
    "Success": true,
    "ErrMsg": null,
    "Message": null,
    "ErrorCode": "0",
    "ErrorMessage": null,
    "ErrorMsgLst": null,
    "TotalCount": 495,
    "Expansion": null
}
```

|       |          |     |
| ----- | -------- | --- |
| FSRQ  | 净值日期 |
| DWJZ  | 单位净值 |
| LJJZ  | 累计净值 |
| JZZZL | 日增长率 |

- 查询基金基本信息

地址:https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation

请求方式:POST

参数列表:version=6.2.4&plat=Android&appType=ttjj&FCODE=005919&onFundCache=3&keeeeeyparam=FCODE&deviceid=656c09923c567b89bb44801020bc59ab%7C%7Ciemi_tluafed_me&igggggnoreburst=true&product=EFund&MobileKey=656c09923c567b89bb44801020bc59ab%7C%7Ciemi_tluafed_me

https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation?version=6.2.4&plat=Android&appType=ttjj&FCODE=320007&onFundCache=3&keeeeeyparam=FCODE&deviceid=656c09923c567b89bb44801020bc59ab%7C%7Ciemi_tluafed_me&igggggnoreburst=true&product=EFund&MobileKey=656c09923c567b89bb44801020bc59ab%7C%7Ciemi_tluafed_me

## 股票接口

`secid` 是参数，`000725` 为 `0.000725`

```
https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=0.000725&fields1=f1%2Cf2%2Cf3%2Cf4%2Cf5%2Cf6%2Cf7%2Cf8%2Cf9%2Cf10%2Cf11%2Cf12%2Cf13%2Cf14&fields2=f51%2Cf53%2Cf54%2Cf55%2Cf56%2Cf57%2Cf58&iscr=0&iscca=0&ut=f057cbcbce2a86e2866ab8877db1d059&ndays=1
```

`600031` 为 `1.600031` :

```
https://push2.eastmoney.com/api/qt/stock/get?secid=1.600031&ut=f057cbcbce2a86e2866ab8877db1d059&fields=f107,f111,f182
```
