# core/wml

WML 프로젝트 데이터의 타입, 메모리 상태, 브라우저 저장, 기본 수정/계산 로직을 관리하는 영역입니다.

## 파일 역할

- `wmlTypes.ts`: WML 데이터 구조 타입 정의
- `wmlStore.ts`: 현재 WML 프로젝트 상태 관리 + localStorage 저장/불러오기
- `wmlUtils.ts`: 기본 프로젝트 생성, note/section 수정 함수, tick/tempo 계산 함수
