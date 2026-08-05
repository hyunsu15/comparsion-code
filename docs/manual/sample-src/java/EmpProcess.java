package com.koscom.member.online;

import java.time.LocalDateTime;
import com.koscom.member.mapper.MemberMapper;
import com.koscom.member.model.Employee;
import com.koscom.common.exception.BizException;

/** MEMBER001 : 사원 인증 / 권한 확인 (PB 이관) */
@Service
public class EmpProcess {

    private final MemberMapper memberMapper;

    public EmpProcess(MemberMapper memberMapper) {
        this.memberMapper = memberMapper;
    }

    /**
     * 사원 인증 — 사번/비밀번호를 확인하고 권한 등급을 돌려준다.
     * PB 의 emp_auth_check() 와 1:1 대응.
     */
    public Employee processEmployee(String empNo, String passwd) {

        Employee emp = memberMapper.selectEmployee(empNo);
        if (emp == null) {
            throw new BizException("E0201", "사원정보가 존재하지 않습니다.");
        }

        if (!emp.getPasswd().equals(encrypt(passwd))) {
            memberMapper.updateFailCnt(empNo);
            throw new BizException("E0202", "비밀번호가 일치하지 않습니다.");
        }

        if (emp.getFailCnt() >= 5) {
            throw new BizException("E0203", "비밀번호 오류 5회 초과입니다.");
        }

        emp.setAuthGrade(selectAuthGrade(empNo));
        emp.setLastLoginDtm(LocalDateTime.now());

        memberMapper.updateLastLogin(empNo);
        return emp;
    }

    /** 권한 등급 조회 — PB 의 emp_grade_select() */
    public String selectAuthGrade(String empNo) {
        String grade = memberMapper.selectAuthGrade(empNo);
        return grade == null ? "9" : grade;
    }

    /** 비밀번호 단방향 암호화 */
    private String encrypt(String raw) {
        return CryptoUtil.sha256(raw);
    }
}
