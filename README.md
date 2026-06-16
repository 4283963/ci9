# Blueprint Review System

轻量化全栈图纸评审协同系统

## 项目结构

```
ci9/
├── blueprint-canvas/    # 前端 React + Canvas/WebGL
│   └── src/
│       ├── components/canvas/    # 图纸切片渲染与批注图层
│       ├── hooks/                # 自定义 Hooks（缩放平移、协同）
│       ├── store/                # Zustand 状态管理
│       ├── services/             # WebSocket/API 服务层
│       └── utils/                # 切片计算、坐标转换
└── blueprint-api/       # 后端 Java Spring Boot
    └── src/main/java/com/blueprint/
        ├── controller/           # REST API 控制器
        ├── websocket/            # WebSocket 协同处理
        ├── service/              # 业务逻辑层
        ├── repository/           # PostGIS 数据访问
        ├── entity/               # JPA + PostGIS 实体
        └── config/               # 配置类
```

## 启动说明

### 前端
```bash
cd blueprint-canvas
npm install
npm run dev
```

### 后端
```bash
cd blueprint-api
mvn spring-boot:run
```

需要 PostgreSQL + PostGIS 扩展支持。
