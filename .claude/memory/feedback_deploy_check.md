---
name: 배포 체크 필수 프로토콜
description: 매 커밋/푸시 후 반드시 Vercel 배포 상태를 확인하는 규칙
type: feedback
---

매 작업 완료 후 반드시 아래 3단계를 수행할 것:

1. `cp dashboard.html index.html` → `diff` 로 동일 확인
2. 같은 커밋에 두 파일 함께 `git add` → `commit` → `push`
3. push 후 WebFetch로 `https://interbiz-instructor.vercel.app` 접속하여 변경사항이 실제 반영되었는지 확인

**Why:** dashboard.html과 index.html이 분리 커밋되거나, Vercel CDN 캐시/배포 지연으로 구버전이 서빙되는 문제가 반복 발생. 사용자가 여러 차례 불편을 겪음.

**How to apply:** 모든 코드 변경 작업 후 커밋/푸시 시 반드시 이 프로토콜 적용. 특히 WebFetch 배포 확인을 생략하지 말 것.
