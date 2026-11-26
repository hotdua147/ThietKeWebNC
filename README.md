# StyleLens — Website thời trang tích hợp AI tìm kiếm và gợi ý sản phẩm

StyleLens là một cửa hàng thời trang trực tuyến (bản demo học tập) có hai tính năng AI chính:

* **Tìm kiếm bằng hình ảnh** — tải lên một tấm ảnh, nhận về các sản phẩm giống nhất kèm % độ giống.
* **Gợi ý sản phẩm** — sản phẩm tương tự (cùng vector đặc trưng) và gợi ý phối đồ khác loại kèm lý do.

Ảnh được mã hóa bằng mô hình **Fashion-CLIP** thành vector 512 chiều; **Qdrant** tìm theo độ tương
đồng cosine; đơn hàng lưu trong **SQLite** qua **ORM SQLAlchemy**. Giao diện **React (Vite)**, backend
**FastAPI** phân lớp, chạy bằng **Docker Compose** hoặc chạy trực tiếp không cần Docker.

> Bài tập lớn học phần Thiết kế web nâng cao — Trường Đại học Phenikaa, lớp N01_LT1.

## Mục lục

* [Tính năng](#tính-năng)
* [Kết quả đo](#kết-quả-đo)
* [Kiến trúc](#kiến-trúc)
* [Cài đặt và chạy](#cài-đặt-và-chạy)
* [Nạp dữ liệu sản phẩm (bắt buộc)](#nạp-dữ-liệu-sản-phẩm-bắt-buộc)
* [Biến môi trường](#biến-môi-trường)
* [API](#api)
* [Kiểm thử](#kiểm-thử)
* [Cấu trúc thư mục](#cấu-trúc-thư-mục)
* [Giới hạn](#giới-hạn)
* [Dữ liệu và bản quyền](#dữ-liệu-và-bản-quyền)

## Tính năng

**Khách hàng**

* Tìm bằng ảnh: kéo thả, dán (Ctrl+V) hoặc chọn tệp JPG/PNG ≤ 5 MB; Top-K kết quả kèm hạng và % độ giống; lọc theo danh mục, khoảng giá.
* Tìm theo tên trên thanh tiêu đề — gõ không dấu vẫn ra ("ao khoac" khớp "Áo khoác").
* Sắp xếp theo độ phù hợp, giá, tên (đúng thứ tự chữ cái tiếng Việt), hàng mới; danh sách hiện dần 24 sản phẩm mỗi lần.
* Trang sản phẩm: chọn size, **sản phẩm tương tự**, **gợi ý phối đồ** (mỗi món kèm lý do), sản phẩm đã xem gần đây.
* Giỏ hàng có size, mã giảm giá (`GIAM10`, `CHAO50K`, `FREESHIP`), đặt hàng — **giá, phí giao và mức giảm do máy chủ tính**.
* Tra cứu đơn bằng mã đơn + số điện thoại (chống dò mã); giao diện sáng/tối; đăng ký nhận tin.

**Quản trị viên** (đăng nhập bằng mật khẩu)

* Thêm/cập nhật sản phẩm bằng ảnh — được mã hóa và tìm thấy ngay.
* Quản lý đơn hàng: lọc theo trạng thái, đổi trạng thái theo đúng luồng (Mới → Đang giao → Hoàn tất, hoặc → Đã hủy), xem doanh thu.

## Kết quả đo

Đo trên máy Ryzen 7 7800X3D · 32 GB RAM · RTX 5060 Ti 16 GB · Ubuntu 24.04, với 100.000 vector
(25.000 ảnh H&M thật + vector giả lập). Cách đo từng bước: [`docs/NFR.md`](docs/NFR.md).

| Yêu cầu | Chỉ tiêu | Kết quả | |
|---|---|---|---|
| NFR-01 Độ trễ | API < 300 ms, truy vấn vector < 50 ms | Ở 55 request/giây: tìm bằng ảnh p95 **250 ms**, truy vấn vector p95 **20 ms** | Đạt |
| NFR-02 Độ chính xác | Recall@10 ≥ 80% | **98,9%** (bộ mã hóa thủ công 88 chiều: 79,9%); Precision@10 74,3%; tìm lại cùng mẫu khác màu 73,1% | Đạt |
| NFR-03 Mở rộng | 100.000+ vector, ≥ 50 request/giây | **55,1** request/giây trong chỉ tiêu độ trễ, tối đa đo được 72,3; 0 lỗi | Đạt |
| NFR-04 Triển khai | Chạy bằng `docker compose up` | Chạy trên máy Ubuntu mới cài | Đạt |
| NFR-05 Bảo trì | Coverage ≥ 70%, qua linter | Backend **95%**, front-end `src/lib/` ≥ 84%; ruff, ESLint sạch | Đạt |

Ở 72 request/giây p95 tìm bằng ảnh lên 420 ms — giới hạn tiếp theo là khâu mã hóa từng ảnh riêng lẻ.
Tải được tạo trên cùng máy chạy hệ thống.

## Kiến trúc

```
┌──────────────────────────────┐
│  React SPA (Vite)             │  frontend/src — 7 trang, giỏ hàng ở localStorage
└──────────────┬───────────────┘
               │ HTTP /api/v1/..., /health  (Nginx khi chạy Docker, Vite proxy khi chạy dev)
               ▼
┌──────────────────────────────┐
│  FastAPI                      │  routers/  →  core/ (nghiệp vụ, thuần Python)  →  store/
│  Fashion-CLIP (CPU hoặc GPU)  │  phụ thuộc được tiêm qua deps.py (Depends)
└───────┬───────────────┬──────┘
        │ VectorStore   │ OrderStore
        ▼               ▼
┌────────────────┐  ┌──────────────────────────────────┐
│ QdrantStore    │  │ SQLite qua ORM SQLAlchemy 2.0     │
│ + chỉ mục danh │  │ orders · order_items ·            │
│ mục trong RAM  │  │ order_history · newsletter        │
└───────┬────────┘  └──────────────────────────────────┘
        ▼
┌──────────────────────────────┐
│  Qdrant (HNSW, cosine)        │
└──────────────────────────────┘
```

* **Mỗi loại dữ liệu ở loại kho phù hợp:** sản phẩm và vector ở Qdrant (tìm theo độ giống); đơn hàng là dữ liệu quan hệ (giao dịch, khóa ngoại) ở SQLite; giỏ hàng của khách chưa đăng nhập ở trình duyệt.
* **Interface tách khỏi cài đặt:** `ImageEncoder` (`FashionClipEncoder` 512 chiều / `SimpleEncoder` 88 chiều) và `VectorStore` (`QdrantStore` / `MemoryStore`) — kiểm thử hợp đồng bảo đảm hai cài đặt cho cùng kết quả.
* **Chỉ mục danh mục trong bộ nhớ** (`store/catalog_index.py`): duyệt, sắp xếp, lọc theo tên không phải đọc lại cả kho Qdrant mỗi lượt; dựng lại ở nền khi hết hạn.
* **Không tin dữ liệu từ trình duyệt:** backend tự tính giá, kiểm tra mã giảm giá, máy trạng thái đơn, giới hạn số lần đăng nhập/tra cứu sai.

## Cài đặt và chạy

Yêu cầu: **Docker + Docker Compose** (cách 1), hoặc **Python 3.12, Node.js 20+** (cách 2). Cả hai cách
đều cần [nạp dữ liệu sản phẩm](#nạp-dữ-liệu-sản-phẩm-bắt-buộc) một lần.

```bash
git clone https://github.com/hotdua147/ThietKeWebNC.git
cd ThietKeWebNC
```

### Cách 1 — Docker Compose

```bash
ADMIN_PASSWORD=<mật-khẩu> docker compose up --build -d
```

| Địa chỉ | Nội dung |
|---|---|
| <http://localhost:5173> | Trang web |
| <http://localhost:8000/docs> | Tài liệu API (Swagger) |

Image `api` dùng PyTorch bản CPU và tải sẵn mô hình lúc build (~2 GB, chạy không cần mạng).

```bash
docker compose down        # dừng, giữ dữ liệu
docker compose down -v     # dừng và xóa sản phẩm, đơn hàng
```

### Cách 2 — Chạy trực tiếp, không cần Docker

Dùng 3 terminal.

**Terminal 1 — Qdrant**

```bash
mkdir -p ~/qdrant && cd ~/qdrant
wget https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
QDRANT__TELEMETRY_DISABLED=true ./qdrant          # lắng nghe ở cổng 6333
```

**Terminal 2 — Backend**

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu128   # GPU NVIDIA; máy không GPU: .../whl/cpu
pip install -r requirements.txt -r requirements-ml.txt
export ENCODER=fashionclip ENCODER_DEVICE=cuda                          # không GPU: ENCODER_DEVICE=cpu
ADMIN_PASSWORD=<mật-khẩu> uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Máy yếu hoặc chưa muốn cài PyTorch: `ENCODER=simple` (bộ mã hóa thủ công 88 chiều). Không có Qdrant:
`STORE_BACKEND=memory` (sản phẩm giữ trong RAM, mất khi dừng).

**Terminal 3 — Front-end**

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173 — Vite tự chuyển /api sang cổng 8000
```

## Nạp dữ liệu sản phẩm (bắt buộc)

Cửa hàng chỉ dùng ảnh thật từ bộ **[H&M Personalized Fashion Recommendations](https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations/data)**
(Kaggle). Kho mã nguồn **không kèm ảnh** vì điều khoản cuộc thi không cho phân phối lại.

1. Tải bộ dữ liệu (cần tài khoản Kaggle và đồng ý điều khoản cuộc thi). Chỉ cần `articles.csv`,
   thư mục `images/` (~30 GB) và — tùy chọn, để lấy giá thật — `transactions_train.csv`.
2. Chạy công cụ nạp khi Qdrant đang chạy:

```bash
# Cách 1 (Docker)
docker compose run --rm -v "/duong/dan/hm:/data/hm:ro" api \
    python -m app.import_hm --data /data/hm --per-category 200

# Cách 2 (không Docker, trong thư mục backend, đã kích hoạt .venv)
python -m app.import_hm --data /duong/dan/hm --per-category 400 --batch-size 128 --workers 12
```

| Tùy chọn | Ý nghĩa |
|---|---|
| `--per-category N` | Số sản phẩm tối đa mỗi danh mục (áo thun, sơ mi, váy, quần, áo khoác) |
| `--batch-size N` | Số ảnh mỗi lô gửi bộ mã hóa (GPU 16 GB: 128–256) |
| `--workers N` | Số luồng đọc, giải mã ảnh song song |
| `--transactions <tệp>` | Lấy giá trung bình từ lịch sử mua |
| `--dry-run` | Xem trước sẽ nạp gì, không ghi |

Công cụ ánh xạ loại sản phẩm H&M vào 5 danh mục (bỏ giày, phụ kiện), mỗi mẫu một màu, đệm ảnh thành
hình vuông nền trắng rồi mã hóa theo lô. SKU dạng `HM-<mã 10 số>` nên chạy lại không tạo trùng.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ENCODER` | `fashionclip` | `fashionclip` (512 chiều) hoặc `simple` (88 chiều) |
| `ENCODER_DEVICE` | `cpu` | `cuda` nếu có GPU NVIDIA |
| `FASHION_CLIP_MODEL` | `patrickjohncyh/fashion-clip` | Mô hình trên HuggingFace |
| `STORE_BACKEND` | `qdrant` | `qdrant` hoặc `memory` |
| `QDRANT_HOST` / `QDRANT_PORT` | `localhost` / `6333` | Kết nối Qdrant |
| `CATALOG_INDEX_TTL` | `10` | Số giây trước khi chỉ mục danh mục trong RAM được dựng lại (thay đổi từ tiến trình khác hiện chậm tối đa chừng này) |
| `ORDERS_DB_PATH` | `data/stylelens.sqlite3` | Tệp SQLite đơn hàng và email nhận tin |
| `ADMIN_PASSWORD` | `stylelens-admin` | Mật khẩu quản trị — **bắt buộc đổi khi đưa lên mạng** |
| `ADMIN_TOKEN_SECRET` | ngẫu nhiên mỗi lần khởi động | Khóa ký token; đặt cố định để phiên không mất khi khởi động lại |
| `ADMIN_TOKEN_TTL` / `LOGIN_MAX_FAILURES` | `28800` / `5` | Hạn token (giây); số lần đăng nhập sai trước khi khóa 15 phút |
| `LOOKUP_MAX_FAILURES` / `LOOKUP_WINDOW_SECONDS` | `10` / `900` | Giới hạn tra cứu đơn sai |
| `CORS_ORIGINS` | `*` | Nguồn được gọi API trực tiếp (không cần khi đi qua proxy) |
| `VITE_BACKEND_PORT` (front-end) | `8000` | Cổng backend cho proxy của Vite |

## API

Mọi đường dẫn có tiền tố `/api/v1` (trừ `/health`). Lỗi luôn có dạng `{"detail": "thông báo tiếng Việt"}`.
Endpoint quản trị cần header `Authorization: Bearer <token>`. Tài liệu đầy đủ, thử trực tiếp tại `/docs`.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Trạng thái API, Qdrant, bộ mã hóa đang dùng |
| POST | `/search/image` | Tìm bằng ảnh (multipart `file`, `top_k`, `category`, `min_price`, `max_price`, `q`, `sort`) |
| GET | `/items` | Duyệt danh mục: `q`, `category`, `min_price`, `max_price`, `source`, `sort`, `offset`, `limit`, `skus` |
| GET | `/items/{sku}` | Chi tiết sản phẩm |
| GET | `/items/{sku}/similar` | Sản phẩm tương tự |
| GET | `/items/{sku}/outfit` | Gợi ý phối đồ, mỗi món kèm `match` và `reason` |
| POST | `/orders` | Đặt hàng — giá, phí giao, mức giảm do backend tính |
| POST | `/orders/quote` | Tính thử tổng tiền và mã giảm giá, chưa tạo đơn |
| POST | `/orders/lookup` | Tra cứu đơn bằng mã + số điện thoại |
| POST | `/newsletter` | Đăng ký nhận tin |
| POST | `/admin/login` | Đăng nhập → `{token, expires_at}` |
| GET | `/admin/me` | Kiểm tra token |
| POST | `/admin/items` | Thêm/cập nhật sản phẩm kèm ảnh |
| DELETE | `/admin/items/{sku}` | Xóa sản phẩm do quản trị viên thêm |
| GET | `/admin/orders` | Danh sách đơn, số đơn theo trạng thái, doanh thu |
| PATCH | `/admin/orders/{id}` | Đổi trạng thái (sai luồng → 409) |
| DELETE | `/admin/orders/{id}` | Xóa đơn |

`sort`: `relevance` (mặc định), `newest`, `price-asc`, `price-desc`, `name-asc`.

## Kiểm thử

```bash
cd backend
python -m pytest tests -q                       # 129 bài; 3 bài cần mô hình thật tự bỏ qua
python -m pytest tests --cov=app                # độ bao phủ
RUN_FASHION_CLIP=1 HM_DATA_DIR=/duong/dan/hm python -m pytest tests/test_embedding.py -v   # Fashion-CLIP thật

cd ../frontend
npm test                                        # 52 bài
```

| Tệp | Số bài | Nội dung |
|---|---|---|
| `test_core.py` | 32 | Kiểm tra tệp tải lên, bộ mã hóa, xếp hạng cosine, lọc, `MemoryStore` |
| `test_shop_core.py` | 33 | Tìm chữ tiếng Việt, sắp xếp, đơn hàng, máy trạng thái, ORM (giao dịch, khóa ngoại, di trú), khởi động nhiều tiến trình, token, phối đồ, mã giảm giá |
| `test_api.py` | 28 | Endpoint HTTP thật qua `TestClient` |
| `test_catalog_index.py` | 8 | Chỉ mục danh mục: so với cách cũ trên 3.000+ tổ hợp, TTL, dựng lại ở nền |
| `test_import_hm.py` | 8 | Công cụ nạp H&M, đọc ảnh song song cho cùng kết quả |
| `test_embedding.py` | 7 (+3) | Fashion-CLIP với mô hình giả; +3 bài với mô hình thật trên ảnh H&M |
| `test_qdrant_store.py` | 5 | Kiểm thử hợp đồng `QdrantStore` — `MemoryStore` |
| `test_nfr.py` | 5 | Công cụ đo Recall@K, sinh vector, tổng hợp kết quả Locust |

Đo yêu cầu phi chức năng (Recall@10, 100.000 vector, load test Locust): xem [`docs/NFR.md`](docs/NFR.md).

## Cấu trúc thư mục

```
├── docker-compose.yml        # 3 service: qdrant, api, web
├── backend/                  # FastAPI — xem backend/README.md
│   ├── app/
│   │   ├── routers/          # endpoint HTTP
│   │   ├── core/             # nghiệp vụ thuần Python: tìm kiếm, đơn hàng, phối đồ, mã hóa ảnh…
│   │   ├── store/            # QdrantStore, MemoryStore, chỉ mục danh mục, OrderStore (ORM)
│   │   └── import_hm.py      # công cụ nạp ảnh H&M
│   ├── nfr/                  # công cụ đo NFR: eval_recall, seed_vectors, locustfile
│   ├── tests/
│   └── Dockerfile
├── frontend/                 # React + Vite — xem frontend/README.md
│   ├── src/                  # pages/, components/, context/, hooks/, lib/
│   ├── tests/
│   └── Dockerfile, nginx.conf
└── docs/
    ├── NFR.md                # hướng dẫn và kết quả đo yêu cầu phi chức năng
    └── SPRINTS.md            # nhật ký các vòng lặp phát triển
```

## Giới hạn

* Quản trị dùng **một mật khẩu chung**, chưa có tài khoản, phân quyền, nhật ký thao tác. Khi đưa lên mạng phải đặt `ADMIN_PASSWORD`, chạy sau HTTPS và chỉ mở cổng của Nginx.
* Giới hạn đăng nhập/tra cứu sai lưu trong bộ nhớ của từng tiến trình; chạy nhiều máy chủ cần kho dùng chung (ví dụ Redis). SQLite phù hợp một máy chủ; tải lớn nên chuyển sang PostgreSQL.
* Trên ~55 request/giây độ trễ tìm bằng ảnh vượt 300 ms; tìm theo tên trên 100.000 sản phẩm vẫn duyệt tuần tự (~0,1 s).
* Gợi ý phối đồ dựa trên quy tắc màu và họa tiết, chưa học từ dữ liệu; danh mục chưa có giày, phụ kiện.
* Không có thanh toán thật, quản lý tồn kho, tài khoản khách hàng.

## Dữ liệu và bản quyền

* Ảnh sản phẩm từ bộ dữ liệu H&M (Kaggle) **chỉ dùng cho học tập và nghiên cứu** theo điều khoản cuộc thi — không đưa vào kho mã nguồn, không dùng thương mại.
* Mô hình [Fashion-CLIP](https://huggingface.co/patrickjohncyh/fashion-clip) — P. J. Chia và cộng sự, *Scientific Reports*, 2022.

## Tác giả

Trần Công Thành Đạt — Trường Đại học Phenikaa, lớp N01_LT1. Giảng viên hướng dẫn: thầy Trịnh Thanh Bình.
