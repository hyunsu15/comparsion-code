# BigDecimal 연산 쉽게 만들기

해당문서는 최신 자바 26, 스프링부트 4.1 기준이라 다를수 있음.

build.gradle 내용 추가
```
plguins{
    ...
     id 'org.jetbrains.kotlin.jvm' version '2.4.0'//추가
    ...
}


kotlin {
    jvmToolchain(26)   // Java 툴체인과 맞춤
}
```


```
object Calc {
    private val MC = MathContext(20, RoundingMode.HALF_UP)
    operator fun BigDecimal.div(other: BigDecimal): BigDecimal = divide(other, MC)
    fun BigDecimal.won(): BigDecimal = setScale(0, RoundingMode.HALF_UP)   // 원 단위 절사 같은 도메인 규칙도 추가 가능
    // 이런식으로 도메인 규칙을 더 강제 시킬수도 있음.
}

inline fun <T> calc(block: Calc.() -> T): T = Calc.block()
```

수식 계산.kt
코틀린은 기본적으로 더하기,뺴기,곱하기는 저렇게 가능함.

```
object FeeFormulas {
    /** 위탁수수료 = 약정금액 × 수수료율, 원 미만 절사 (수수료 규정 §3.2) */
    @JvmStatic
    fun brokerageFee(amount: BigDecimal, rate: BigDecimal): BigDecimal =
        calc { (amount * rate).won() }
}
```


부르는 자바쪽
{

BigDecimal fee = FeeFormulas.brokerageFee(amount, rate);
}
