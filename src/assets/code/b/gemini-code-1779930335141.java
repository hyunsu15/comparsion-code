import java.util.regex.Pattern;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class UserRegistration {

    // ========================================================
    // 1. 메서드 선언 및 구현부 (최상단 배치)
    // ========================================================
    
    // [내부 메서드 1] 이메일 형식 검증
    private static boolean isValidEmail(String email) {
        String emailRegex = "^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,7}$";
        return Pattern.matches(emailRegex, email);
    }

    // [내부 메서드 2] 비밀번호 복잡성 검증 (8자 이상)
    private static boolean isValidPassword(String password) {
        return password != null && password.length() >= 8;
    }

    // [내부 메서드 3] 가입일자 포맷팅 문자열 생성
    private static String getFormattedCurrentTime() {
        LocalDateTime now = LocalDateTime.now();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        return now.format(formatter);
    }

    // [내부 메서드 4] 가입 실패 에러 메시지 출력 및 강제 종료
    private static void handleRegistrationError(String reason) {
        System.out.println("\n[가입 실패] " + reason);
        System.out.println("프로그램을 안전하게 종료합니다.");
        System.exit(1); // 에러 발생 시 프로그램 종료
    }

    // [내부 메서드 5] 종합 회원 가입 처리 프로세스
    private static void processRegistration(String email, String password, String name) {
        // 내부 메서드 1 사용
        if (!isValidEmail(email)) {
            handleRegistrationError("유효하지 않은 이메일 형식입니다."); // 내부 메서드 4 사용
        }

        // 내부 메서드 2 사용
        if (!isValidPassword(password)) {
            handleRegistrationError("비밀번호는 8자 이상이어야 합니다."); // 내부 메서드 4 사용
        }

        // 내부 메서드 3 사용
        String joinDate = getFormattedCurrentTime();

        // 최종 가입 성공 출력
        System.out.println("\n--- 회원가입이 완료되었습니다 ---");
        System.out.println("이  름 : " + name);
        System.out.println("이메일 : " + email);
        System.out.println("가입일 : " + joinDate);
        System.out.println("---------------------------------");
    }

    // ========================================================
    // 2. 메인 실행부
    // ========================================================
    public static void main(String[] args) {
        // 외부나 UI로부터 입력받았다고 가정하는 테스트 데이터
        String inputEmail = "user@example.com";
        String inputPassword = "securePassword123";
        String inputName = "홍길동";

        System.out.println("회원가입 요청을 처리하는 중...");

        // 내부 메서드 5 호출을 통해 전체 프로세스 구동
        processRegistration(inputEmail, inputPassword, inputName);
    }
}