# /api-sync — Export Live OpenAPI Spec

NestJS generates OpenAPI automatically from @ApiProperty decorators.
No static file needed. Export when backend is running:

```bash
# Backend must be running on port 3000
curl http://localhost:3000/api/docs-json -o openapi.json

# Or use the NestJS CLI plugin to generate at build time:
# Add to nest-cli.json:
# { "compilerOptions": { "plugins": ["@nestjs/swagger"] } }
# Then:
npx ts-node -e "
const { NestFactory } = require('@nestjs/core');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { AppModule } = require('./src/app.module');
async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder().setTitle('API').addBearerAuth().build();
  const doc = SwaggerModule.createDocument(app, config);
  require('fs').writeFileSync('openapi.json', JSON.stringify(doc, null, 2));
  await app.close();
}
generate();
"
```

Then:
```bash
git add openapi.json
git commit -m "chore(api): export openapi spec"
git push origin main
```

Frontend can now run /api-sync from their project using this file.
