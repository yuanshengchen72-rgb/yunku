import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Image,
  Input,
  Layout,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { OfferSnapshot } from "../shared/contracts";
import { alibabaAuthorizationUrl, importOffers, loadAppState, type AppState } from "./api";

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

export function App() {
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<OfferSnapshot[]>([]);
  const [appState, setAppState] = useState<AppState>();
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    loadAppState().then(setAppState).catch((error) => {
      messageApi.error(error instanceof Error ? error.message : "无法读取应用状态");
    });
  }, [messageApi]);

  const columns: ColumnsType<OfferSnapshot["skus"][number]> = [
    { title: "源 SKU", dataIndex: "sourceSkuId", ellipsis: true },
    {
      title: "规格",
      render: (_, sku) => Object.entries(sku.attributes).map(([key, value]) => (
        <Tag key={key}>{key}：{value}</Tag>
      ))
    },
    {
      title: "采购价",
      dataIndex: "priceCents",
      render: (value: number) => `¥${(value / 100).toFixed(2)}`
    },
    { title: "库存快照", dataIndex: "availableStock" }
  ];

  async function handleImport() {
    const references = reference.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (references.length === 0) return;
    setLoading(true);
    try {
      const result = await importOffers(references);
      setOffers(result);
      messageApi.success(`已导入 ${result.length} 个商品快照`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="app-shell">
      {contextHolder}
      <Header className="topbar">
        <div className="brand-mark">电</div>
        <div>
          <div className="brand-name">电潮分销</div>
          <div className="brand-subtitle">1688 → 微信小店</div>
        </div>
        <Tag color={appState?.mode === "real" ? "green" : "blue"} className="mode-tag">
          {appState?.mode === "real" ? "真实1688模式" : "本地模拟模式"}
        </Tag>
      </Header>
      <Content className="content">
        <section className="hero">
          <Text className="eyebrow">V1 · 批量商品导入</Text>
          <Title level={1}>把 1688 商品，变成可编辑的铺货资料</Title>
          <Paragraph>
            每行输入一个1688商品链接或 Offer ID，单次最多20个。完成1688授权后即可读取真实分销商品信息。
          </Paragraph>
          {appState?.mode === "real" && !appState.connected && (
            <Button type="primary" size="large" href={alibabaAuthorizationUrl("/")}>
              连接1688账号
            </Button>
          )}
          {appState?.mode === "real" && appState.connected && (
            <Tag color="success">1688账号已连接：{appState.session?.alibabaUserId}</Tag>
          )}
        </section>

        <Alert
          type="info"
          showIcon
          message="安全提示"
          description="AppSecret 和 AccessToken 不进入浏览器或代码仓库；服务端使用环境变量，并对令牌进行 AES-256-GCM 加密。"
          className="security-alert"
        />

        <Card className="import-card" bordered={false}>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Input.TextArea
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              autoSize={{ minRows: 5, maxRows: 12 }}
              placeholder={"每行一个商品，例如：\nhttps://detail.1688.com/offer/123456789012.html\n789870588118"}
              aria-label="1688 商品链接或 Offer ID 列表"
            />
            <Button
              type="primary"
              size="large"
              loading={loading}
              onClick={handleImport}
              disabled={!reference.trim() || !appState?.connected}
            >
              批量导入商品
            </Button>
            <Text type="secondary">支持 detail.1688.com 商品链接或 6–30 位数字 Offer ID</Text>
          </Space>
        </Card>

        {offers.length === 0 ? (
          <Card className="empty-card" bordered={false}>
            <Empty description="导入后在这里检查标题、图片、SKU、价格与库存快照" />
          </Card>
        ) : (
          <div className="result-stack">
            {offers.map((offer) => (
              <Card key={offer.offerId} className="result-card" bordered={false}>
                <Row gutter={[32, 24]}>
                  <Col xs={24} lg={9}>
                    <div className="image-grid">
                      {offer.imageUrls.map((url, index) => (
                        <Image key={`${url}-${index}`} src={url} alt={`商品图 ${index + 1}`} />
                      ))}
                    </div>
                  </Col>
                  <Col xs={24} lg={15}>
                    <Tag color="geekblue">Offer {offer.offerId}</Tag>
                    <Title level={2}>{offer.title}</Title>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="1688 类目">{offer.categoryId}</Descriptions.Item>
                      <Descriptions.Item label="SKU 数量">{offer.skus.length}</Descriptions.Item>
                      <Descriptions.Item label="导入时间">
                        {new Date(offer.importedAt).toLocaleString("zh-CN")}
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                </Row>
                <Table
                  className="sku-table"
                  rowKey="sourceSkuId"
                  columns={columns}
                  dataSource={offer.skus}
                  pagination={false}
                  scroll={{ x: 760 }}
                />
              </Card>
            ))}
          </div>
        )}
      </Content>
    </Layout>
  );
}
