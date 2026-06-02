import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class EmpProcess {

    // ========================================================
    // 1. 메서드 선언부 (자바는 클래스 멤버 변수/메서드로 상단 배치)
    // ========================================================
    private  double calculateTax(double sal) { return sal * 0.1; }
    private  double calculateBonus(double sal) { return sal * 0.15; }
    
    private static void printRow(String name, double base, double tax, double bonus) {
        double netPay = base - tax + bonus;
        System.out.printf("%-10s | %10.2f | %10.2f | %10.2f | %10.2f%n", 
                name, base, tax, bonus, netPay);
    }
    
    private static void checkError(Exception e, String msg) {
        System.out.println("\n[에러] " + msg);
        if (e != null) {
            System.out.println("상세 메시지: " + e.getMessage());
        }
        // 자바는 필요시 여기서 시스템 종료 혹은 예외를 뒤로 던집니다.
        System.exit(1);
    }

    private static void processEmployee(String name, double sal) {
        double t = calculateTax(sal);    // 내부 메서드 1 호출
        double b = calculateBonus(sal);  // 내부 메서드 2 호출
        printRow(name, sal, t, b);       // 내부 메서드 3 호출
    }

    // ========================================================
    // 2. 메인 실행부
    // ========================================================
    public static void main(String[] args) {
        String url = "jdbc:oracle:thin:@localhost:1521:xe";
        String user = "scott";
        String password = "tiger";

        String sql = "SELECT ename, sal FROM emp WHERE deptno = 20";

        // Try-with-resources 문법으로 DB 자원 자동 해제
        try (Connection conn = DriverManager.getConnection(url, user, password);
             PreparedStatement pstmt = conn.prepareStatement(sql);
             ResultSet rs = pstmt.executeQuery()) {

            System.out.printf("%-10s | %10s | %10s | %10s | %10s%n", "이름", "기본급", "세금(-)", "보너스(+)", "실수령액");
            System.out.println("-------------------------------------------------------------------------");

            // Pro*C의 FETCH 루프와 동일한 역할 (행이 없을 때까지 반복)
            while (rs.next()) {
                String empName = rs.getString("ename");
                double salary = rs.getDouble("sal");

                // 내부 메서드 5 호출
                processEmployee(empName, salary);
            }

        } catch (SQLException e) {
            // 내부 메서드 4 호출
            checkError(e, "데이터베이스 처리 중 오류가 발생했습니다.");
        }
    }
}