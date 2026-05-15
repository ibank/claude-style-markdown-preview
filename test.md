# Claude Markdown Style — Mermaid Test

일반 마크다운과 mermaid 다이어그램이 같이 잘 나오는지 확인.

## Flowchart

```mermaid
flowchart LR
    A[유저 입력] --> B{유효?}
    B -->|Yes| C[처리]
    B -->|No| D[에러 반환]
    C --> E[저장]
    E --> F[응답]
```

## Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant C as Claude Code
    participant T as Tool

    U->>C: 질문
    C->>T: ToolCall
    T-->>C: 결과
    C-->>U: 답변
```

## Class

```mermaid
classDiagram
    class Animal {
      +String name
      +int age
      +makeSound()
    }
    class Dog {
      +bark()
    }
    Animal <|-- Dog
```

## Pie

```mermaid
pie title 시간 분배
    "코딩" : 45
    "회의" : 25
    "리뷰" : 20
    "기타" : 10
```

## Gantt

```mermaid
gantt
    title 프로젝트 일정
    dateFormat  YYYY-MM-DD
    section 설계
    요구사항    :a1, 2026-05-01, 5d
    아키텍처    :after a1, 5d
    section 구현
    백엔드      :2026-05-15, 10d
    프론트엔드  :2026-05-20, 10d
```

## 일반 코드 블록도 영향 없는지

```python
def hello():
    print("이건 그냥 파이썬")
```

## 잘못된 mermaid (에러 표시 확인)

```mermaid
this is not valid mermaid syntax !!!
```
